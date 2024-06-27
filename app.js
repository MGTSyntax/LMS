import express, { json, urlencoded } from 'express';
import {
    getLoans, createLoan, getTotalLoansCount, getDeductionDesc, isEmployeeQualified,
    isLoanExisting, getNextTransactionNumber, getEmployeeDivision, getAllUsers, updateLnNum,
    createLoanPayment
} from './database.js';
import multer from 'multer';
import excelJS from 'exceljs';
import deductionOptions from './public/js/constants.js';

const app = express();
const resultsPerPage = 15;
const deductionTypes = deductionOptions;

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Function to retrieve loans with pagination
async function getLoansPaginated(page) {
    const offset = (page - 1) * resultsPerPage;
    const loans = await getLoans(offset, resultsPerPage); // Replace with your logic
    const totalLoans = await getTotalLoansCount(); // Replace with your logic
    const totalPages = Math.ceil(totalLoans / resultsPerPage);
    return { loans, totalPages };
}

app.get('/', async (req, res) => {
    res.render('index');
});

app.get("/loans", async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const { loans, totalPages } = await getLoansPaginated(page);
        res.render('loans', { loanData: loans, currentPage: page, totalPages });
    } catch (error) {
        next(error);
    }
});

app.get("/upload-loan", async (req, res) => {
    try {
        const deductionDesc = await getDeductionDesc(req.query.deductionType);
        const allusers = await getAllUsers();

        res.render('uploadLoan', {
            deductionTypes,
            deductionDesc,
            actdata: null,
            allusers
        });
    } catch (error) {
        console.log(error);
        next(error);
    } 
});

app.post('/upload-loan', upload.single('loanExcelFile'), async (req, res) => {
    try {
        const { selectedDeductionCode, preparedByCode, approvedByCode } = req.body;
        const deductionDesc = await getDeductionDesc(req.query.deductionType);

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
            lnm_amount: row[2]
        })));

        const qualifiedData = [];
        const unqualifiedData = [];

        for (const loanData of await mappedData) {
            const { lnm_employeeno, lnm_employeename, lnm_amount } = loanData;

            const isQualified = await isEmployeeQualified(lnm_employeeno);
            const hasExistingLoan = await isLoanExisting(lnm_employeeno, selectedDeductionCode);

            if (isQualified && !hasExistingLoan) {
                try {
                    const division = await getEmployeeDivision(lnm_employeeno)
                    const transactionNumber = await getNextTransactionNumber();
                    const formattedTransactionNumber = `LN-JAD-${transactionNumber.toString().padStart(6, '0')}`;

                    const today = new Date();
                    const loandate = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: '2-digit' });

                    await createLoan(
                        formattedTransactionNumber,
                        loandate,
                        lnm_employeeno,
                        selectedDeductionCode,
                        lnm_amount,
                        lnm_amount,
                        preparedByCode,
                        approvedByCode,
                        'True',
                        lnm_amount,
                        lnm_amount,
                        division,
                        'Saved Using Uploader'
                    );

                    await createLoanPayment(
                        formattedTransactionNumber,
                        1,
                        lnm_amount,
                        '--',
                        '',
                        '',
                        '',
                        lnm_amount
                    );

                    await updateLnNum(transactionNumber);
                    qualifiedData.push(loanData);

                } catch (error) {
                    console.log(error);
                    next(error);
                }
            } else {
                const unQReason = !isQualified ? "Employee not exists" : "Employee has existing loan";
                unqualifiedData.push(`${lnm_employeeno},${lnm_employeename},${lnm_amount},${unQReason}\n`);
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
        const deductionType = req.body.deductionType;
        const deductionDesc = await getDeductionDesc(deductionType);

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