// database.js

import mysql from 'mysql2'
import dotenv from 'dotenv'

dotenv.config()

export function getConnection(databaseName) {
    return mysql.createPool({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: databaseName
    }).promise();
}

// Get All Loans
export async function getLoans(db, offset, limit){
    const [loanqry] = await db.query(`SELECT lnm_transactionno, 
    lnm_employeeno,
    CONCAT(b.ji_lname,', ',b.ji_fname,' ',LEFT(b.ji_mname,1),'.') AS empname, 
    lnm_date, 
    c.deduction_description, 
    lnm_amount, 
    ROUND(lnm_balance, 2) AS lnm_balance
    FROM tblloans_master a 
    LEFT JOIN trans_basicinfo b 
    ON a.lnm_employeeno=b.ji_empNo 
    LEFT JOIN ps_deduction c 
    ON a.lnm_deductioncode=c.deduction_code 
    WHERE lnm_status = 'True'
    LIMIT ?, ?`, [offset, limit]);
    return loanqry;
};

// Get Total Loan Count
export async function getTotalLoansCount(db) {
    const [countResult] = await db.query('SELECT COUNT(*) AS totalLoans FROM tblloans_master');
    return countResult[0].totalLoans;
}

// Get Loan By Transaction Number
export async function getLoan(db, tn) {
    const [loanqry] = await db.query(`SELECT lnm_transactionno, 
    lnm_employeeno,
    CONCAT(b.ji_lname,', ',b.ji_fname,' ',LEFT(b.ji_mname,1),'.') AS empname,
    lnm_date, 
    c.deduction_description, 
    lnm_amount, 
    lnm_balance 
    FROM tblloans_master a 
    LEFT JOIN trans_basicinfo b 
    ON a.lnm_employeeno=b.ji_empNo 
    LEFT JOIN ps_deduction c 
    ON a.lnm_deductioncode=c.deduction_code 
    WHERE lnm_transactionno = ?`, [tn]);
    return loanqry[0];
};

// Get Deduction Description/Name
export async function getDeductionDesc(db, dedType) {
    const [deductionType] = await db.query(`
    SELECT deduction_code, deduction_description FROM ps_deduction 
    WHERE deduction_type = ? 
    ORDER BY deduction_description ASC`, [dedType]);
    return deductionType;
};

// Create A New Loan Transaction
export async function createLoan(db, lnm_transactionno, lnm_date, lnm_employeeno, 
    lnm_deductioncode, lnm_amount, lnm_terms, lnm_preparedby, lnm_approvedby, 
    lnm_status, lnm_balance, lnm_originalamt, lnm_division, lnm_remarks) {

        await db.query(`
        INSERT INTO tblloans_master(lnm_transactionno, lnm_date, lnm_employeeno, 
            lnm_deductioncode, lnm_amount, lnm_terms, lnm_preparedby, lnm_approvedby, 
            lnm_status, lnm_balance, lnm_originalamt, lnm_division, lnm_remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [lnm_transactionno, lnm_date, lnm_employeeno, 
            lnm_deductioncode, lnm_amount, lnm_terms, lnm_preparedby, lnm_approvedby, 
            lnm_status, lnm_balance, lnm_originalamt, lnm_division, lnm_remarks]);

        return getLoan(db, lnm_transactionno);
};

export async function createLoanPayment(db, lnm_transactionno, lnd_no, lnd_amount, 
    lnd_payrollperiodno, date_paid, div_paid, cur_balance, prin_balance) {

        await db.query(`
        INSERT INTO tblloans_details(lnm_transactionno, lnd_no, lnd_amount, 
            lnd_payrollperiodno, date_paid, div_paid, cur_balance, prin_balance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [lnm_transactionno, lnd_no, lnd_amount, 
            lnd_payrollperiodno, date_paid, div_paid, cur_balance, prin_balance]);

        return getLoan(db, lnm_transactionno);
};

// Check Employee Status
export async function isEmployeeQualified(db, employeeno) {
    const [result] = await db.query(`
      SELECT COUNT(*) AS totalQualified FROM trans_jobinfo
      WHERE ji_empNo = ? 
        AND ji_active = 1 
        AND ji_jobStat <> 'Processing for Clearance'
    `, [employeeno]);
    return result[0].totalQualified;
};

export async function isLoanExisting(db, employeeno, deductionCode) {
    const [result] = await db.query(`
    SELECT COUNT(*) AS totalLoanExisting FROM tblloans_master
    WHERE lnm_employeeno  = ?
    AND lnm_deductioncode = ?
    AND lnm_balance <= lnm_amount
    AND (lnm_balance <> 0
        AND lnm_balance > 0)
    `, [employeeno, deductionCode]);
    return result[0].totalLoanExisting;
};

export async function getNextTransactionNumber(db) {
    const [currentNumber] = await db.query(
        'SELECT generator_ln FROM ps_generator ORDER BY generator_ln DESC LIMIT 1'
    );
    const currNum = currentNumber.length > 0 ? Number(currentNumber[0].generator_ln) + 1 : 1;
    return currNum;
};

export async function updateLnNum(db, currNumber) {
    await db.query('UPDATE ps_generator SET generator_ln = ?', [currNumber]);
    return currNumber;
};

export async function getEmployeeDivision(db, empno) {
    const [result] = await db.query(`
        SELECT ji_div
        FROM trans_jobinfo
        WHERE ji_empNo = ?
        `, [empno]);
    return result[0].ji_div;
};

export async function getAllUsers(db) {
    const [userqry] = await db.query(`
    SELECT CONCAT(user_lname, ", ", user_fname) AS nameOfUser, user_empno FROM fm_user
    WHERE user_act = 1`);
    return userqry;
};