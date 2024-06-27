document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('loanExcelFile');
    const uploadBtn = document.getElementById('uploadButton');
    const preparedBySelect = document.getElementById('preparedBy');
    const approvedBySelect = document.getElementById('approvedBy');
    const deductionDescriptionSelect = document.getElementById('deductionDescription');
    const tableContainer = document.getElementById('excelDetailsContainer');
    const customModal = document.getElementById('modal');
    const modalMessage = document.getElementById('modalMsg');
    const span = document.getElementsByClassName('close')[0];

    let selectedDeductionCode, preparedByCode, approvedByCode;

    // Check if the elements exist
    if (!deductionDescriptionSelect) {
        return;
    }

    deductionDescriptionSelect.addEventListener('change', (event) => {
        selectedDeductionCode = event.target.value;
    });

    preparedBySelect.addEventListener('change', async (event) => {
        preparedByCode = event.target.value;
    });

    approvedBySelect.addEventListener('change', async (event) => {
        approvedByCode = event.target.value;
    });

    uploadBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];

        if (preparedBySelect.selectedIndex === 0) {
            showModal('Please select an option for Prepared By');
            return;
        }
        
        if (approvedBySelect.selectedIndex === 0) {
            showModal('Please select an option for Approved By');
            return;
        }

        if (!file) {
            console.error('No file selected');
            return;
        }

        const formData = new FormData();
        formData.append('loanExcelFile', file);
        formData.append('selectedDeductionCode', selectedDeductionCode);
        formData.append('preparedByCode', preparedByCode);
        formData.append('approvedByCode', approvedByCode);

        try {
            const response = await fetch('/upload-loan', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const responseData = await response.json();
                updateExcelDetails(responseData.qualifiedData, responseData.unqualifiedData);

                if (Notification.permission !== 'granted') {
                    await Notification.requestPermission();
                }

                if (Notification.permission === 'granted') {
                    const notificationTitle = 'Loan Upload Successful!';
                    const notificationBody = 'Qualified loans processed.';
                    new Notification(notificationTitle, { body: notificationBody });
                }
            } else {
                const errorData = await response.json();
                const errorMessage = errorData.message || 'Error uploading file';
                showModal(errorMessage);
                
            }
        } catch (error) {
            console.error('NetworkError:', error);
            showModal('Network error occurred. Please try again later.');
        }
    });

    function showModal(message) {
        modalMessage.textContent = message;
        customModal.style.display = 'flex';
    }

    // Close the modal when the user clicks on <span> (x)
    span.onclick = function() {
        customModal.style.display = 'none';
    }

    // Close the modal when the user clicks anywhere outside the modal
    window.onclick = function(event) {
        if (event.target == customModal) {
            customModal.style.display = 'none';
        }
    }

    function updateExcelDetails(qualifiedData, unqualifiedData) {
        const noDataMessage = document.getElementById('noDataMessage');

        if (qualifiedData.length > 0) {
            const qualifiedTable = createTable(qualifiedData);
            tableContainer.innerHTML = '';
            tableContainer.appendChild(qualifiedTable);

            noDataMessage.style.display = 'none'; // Hide message if data is present
            uploadBtn.disabled = true;
        } else {
            const messageElement = document.createElement('p');
            messageElement.textContent = 'No qualified applications found.';
            const tableContainer = document.getElementById('excelDetailsContainer');
            tableContainer.innerHTML = ''; // Clear existing table (in case there was previous data)
            tableContainer.appendChild(messageElement);
            
            noDataMessage.style.display = 'block'; // Show message if no data
        }

        createTextFile(unqualifiedData);
    }

    function createTable(qualifiedData) {
        const table = document.createElement('table');
        const tableHead = document.createElement('thead');
        const tableBody = document.createElement('tbody');

        const headerRow = document.createElement('tr');
        Object.keys(qualifiedData[0]).forEach(header => {
            const th = document.createElement('th');
            let displayHeader = header;

            if (header === 'lnm_employeeno') {
                displayHeader = 'Employee Number';
            } else if (header === 'lnm_employeename') {
                displayHeader = 'Employee Name';
            } else if (header === 'lnm_amount') {
                displayHeader = 'Loan Amount';
            }

            th.textContent = displayHeader;
            headerRow.appendChild(th);
        });

        tableHead.appendChild(headerRow);

        qualifiedData.forEach(rowData => {
            const tableRow = document.createElement('tr');
            Object.keys(rowData).forEach(header => {
                const tableCell = document.createElement('td');
                tableCell.textContent = rowData[header];
                tableRow.appendChild(tableCell);
            });
            tableBody.appendChild(tableRow);
        });

        table.appendChild(tableHead);
        table.appendChild(tableBody);

        return table;
    };

    function createTextFile(unqualifiedData) {
        if (unqualifiedData && unqualifiedData.length > 0) {
            const downloadLinkContainer = document.getElementById('download-link-container');
            const downloadLink = document.createElement('button');

            downloadLink.textContent = 'Download Unqualified Data (.txt)';
            downloadLinkContainer.appendChild(downloadLink);

            downloadLink.addEventListener('click', () => {
                const headerRow = "EMPLOYEE NUMBER,EMPLOYEE NAME,LOAN AMOUNT,REASON"
                const unqualifiedDataText = headerRow + '\n' + unqualifiedData.join('');

                const blob = new Blob([unqualifiedDataText], { type: 'text/plain;charset=utf-8' });
                const temporaryLink = document.createElement('a');
                temporaryLink.href = URL.createObjectURL(blob);
                temporaryLink.download = 'unqualified_data.txt';
                temporaryLink.style.display = 'none';

                document.body.appendChild(temporaryLink);
                temporaryLink.click();
                document.body.removeChild(temporaryLink);

                URL.revokeObjectURL(temporaryLink.href);
            });
        }
    };
});