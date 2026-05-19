// app.js

import express, { json, urlencoded } from 'express';
import {
    getLoans, createLoan, getTotalLoansCount, getDeductionDesc, isEmployeeQualified,
    isLoanExisting, getNextTransactionNumber, getEmployeeDivision, getAllUsers, updateLnNum,
    createLoanPayment
} from './database.js';
import multer from 'multer';
import excelJS from 'exceljs';
import deductionOptions from './public/js/constants.js';
import session from 'express-session';
import bcrypt from 'bcrypt';
import companies from './config/companies.js';
import { getConnection } from './database.js';
import { requireLogin } from './middleware/auth.js';

const app = express();
const resultsPerPage = 15;
const deductionTypes = deductionOptions;

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'loan-management-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false
    }
}));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Login Page Route - GET
app.get('/login', (req, res) => {
    res.render('login', {
        companies
    });
});

// Login Page Route - POST
app.post('/login', async (req, res) => {
    try {
        const  { company, username, password } = req.body;

        const databaseName = companies[company];

        if(!databaseName) {
            return res.send('Invalid company!');
        }

        const db = getConnection(databaseName);

        const [users] = await db.query(`
            SELECT user_uname,
                   user_pass,
                   user_empno,
                   CONCAT(user_lname, ', ', user_fname) AS fullname
            FROM fm_user
            WHERE user_uname = ?
            LIMIT 1
        `, [username]);
            
        if (users.length === 0) {
            return res.send('Invalid username or password');
        }

        const user = users[0];

        // SIMPLE LOGIN (plain password)
        // Replace with bcrypt later

        if (user.user_pass !== password) {
            return res.send('Invalid username or password');
        }

        req.session.user = {
            username: user.user_uname,
            empno: user.user_empno,
            fullname: user.fullname,
            company,
            database: databaseName
        };

        res.redirect('/');

    } catch (error) {
        console.log(error);
        res.status(500).send('Login here');
    }
});

// Logout
app.get('/logout', (req, res) => {

    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Dashboard
app.get('/', requireLogin, async (req, res) => {
    res.render('index');
});

// Loan Page Route
app.get('/loans', requireLogin, async (req, res, next) => {

    try {
        const db = getConnection(req.session.user.database);

        const page = parseInt(req.query.page) || 1;

        const offset = (page - 1) * resultsPerPage;

        const loans = await getLoans(db, offset, resultsPerPage);

        const totalLoans = await getTotalLoansCount(db);

        const totalPages = Math.ceil(totalLoans / resultsPerPage);
        
        res.render('loans', { 
            loanData: loans, 
            currentPage: page, 
            totalPages 
        });

    } catch (error) {
        next(error);
    }

});

// Loan Uploader
app.get('/upload-loan', requireLogin, async (req, res) => {
    try {
        const db = getConnection(req.session.user.database);

        const deductionDesc = await getDeductionDesc(db, req.query.deductionType);

        const allusers = await getAllUsers(db);

        const loggedinUser = req.session.user;

        res.render('uploadLoan', {
            deductionTypes,
            deductionDesc,
            actdata: null,
            allusers,
            loggedinUser
        });
    } catch (error) {
        console.log(error);
        next(error);
    } 
});

app.post('/upload-loan', upload.single('loanExcelFile'), async (req, res) => {
    try {
        const db = getConnection(req.session.user.database);

        const { selectedDeductionCode, preparedByCode, approvedByCode } = req.body;

        const deductionDesc = await getDeductionDesc(db, req.query.deductionType);

        if (!deductionDesc) {
            return res.status(400).json({ message: "Please select a deduction description." });
        }

        const workbook = new excelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.worksheets[0];

        const sheetData = worksheet.getSheetValues();
        const actualData = sheetData.slice(2).map(row => row.slice(1));

        const mappedData = Promise.all(actualData.map(async (row) => ({
            lnm_employeeno: row[0],
            lnm_employeename: row[1],
            lnm_amount: row[2],
            lnm_terms: row[3]
        })));

        const qualifiedData = [];
        const unqualifiedData = [];

        for (const loanData of await mappedData) {
            const { lnm_employeeno, lnm_employeename, lnm_amount, lnm_terms } = loanData;

            const isQualified = await isEmployeeQualified(db, lnm_employeeno);
            const hasExistingLoan = await isLoanExisting(db, lnm_employeeno, selectedDeductionCode);

            if (isQualified && !hasExistingLoan) {
                try {
                    const division = await getEmployeeDivision(db, lnm_employeeno)
                    const transactionNumber = await getNextTransactionNumber(db);
                    const formattedTransactionNumber = `LN-JAD-${transactionNumber.toString().padStart(6, '0')}`;

                    const today = new Date();
                    const loandate = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: '2-digit' });

                    await createLoan(
                        db,
                        formattedTransactionNumber,
                        loandate,
                        lnm_employeeno,
                        selectedDeductionCode,
                        lnm_amount,
                        (lnm_amount/lnm_terms),
                        preparedByCode,
                        approvedByCode,
                        'True',
                        lnm_amount,
                        lnm_amount,
                        division,
                        'Saved Using Uploader'
                    );

                    for (let i = 1; i <= lnm_terms; i++) {
                        await createLoanPayment(
                            db,
                            formattedTransactionNumber,
                            i,
                            (lnm_amount / lnm_terms),
                            '--',
                            '',
                            '',
                            '',
                            (lnm_amount / lnm_terms)
                        );
                    }

                    await updateLnNum(db, transactionNumber);
                    qualifiedData.push(loanData);

                } catch (error) {
                    console.log(error);
                    next(error);
                }
            } else {
                const unQReason = !isQualified ? "Employee not exists" : "Employee has existing loan";
                unqualifiedData.push(`${lnm_employeeno},${lnm_employeename},${lnm_amount},${lnm_terms},${unQReason}\n`);
            };
        };

        res.json({
            deductionTypes,
            deductionDesc,
            qualifiedData,
            unqualifiedData
        });

    } catch (error) {
        console.log(error);
        next(error);
    }
});

app.post('/fetch-descriptions', async (req, res) => {
    try {
        const db = getConnection(req.session.user.database);

        const deductionType = req.body.deductionType;

        const deductionDesc = await getDeductionDesc(db, deductionType);

        if (!deductionDesc) {
            return res.status(400).json({ error: 'Please select a deduction description first and upload a file.' });
        }

        res.json(deductionDesc);

    } catch (error) {
        console.log(error);
        next(error);
    }
});

app.use((err, req, res, next) => {
    console.error(err.stack)

    if (process.env.NODE_ENV === 'development') {
        const errorMessage = err && err.message ? err.message : "An error occurred";
        res.status(500).send(errorMessage);
    } else {
        res.status(500).send('Internal Server Error');
    }
});

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});