document.addEventListener('DOMContentLoaded', () => {
    const deductionTypeSelect = document.getElementById('deductionType');
    const deductionDescriptionSelect = document.getElementById('deductionDescription');
    const loanExcelFile = document.getElementById('loanExcelFile');
    const uploadButton = document.getElementById('uploadButton');

    // Check if the elements exist
    if (!deductionTypeSelect || !deductionDescriptionSelect) {
        return;
    }

    deductionTypeSelect.addEventListener('change', async (event) => {
        const selectedDeductionType = event.target.value;

        if (!selectedDeductionType) {
            deductionDescriptionSelect.selectedIndex = 0;
            return;
        }

        try {
            const response = await fetch('/fetch-descriptions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deductionType: selectedDeductionType })
            });

            if (!response.ok) {
                throw new Error(`Error fetching deduction descriptions: ${response.statusText}`);
            }

            deductionDescriptionSelect.innerHTML = ''; // Clear existing options
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.text = 'Select Deduction Description';
            deductionDescriptionSelect.appendChild(defaultOption);

            const data = await response.json();
            data.forEach(desc => {
                const option = document.createElement('option');
                option.value = desc.deduction_code;
                option.text = desc.deduction_description;
                deductionDescriptionSelect.appendChild(option);
            });
        } catch (error) {
            console.error(error);
            // Optionally display an error message to the user
        }
    });

    deductionDescriptionSelect.addEventListener('change', (event) => {
        const selectedDeductionCode = event.target.value;
        loanExcelFile.disabled = !selectedDeductionCode;
    });

    loanExcelFile.addEventListener('change', (event) => {
        const tableContainer = document.getElementById('excelDetailsContainer');
        tableContainer.innerHTML = '';

        if (event.currentTarget.value.length > 0) {
            uploadButton.disabled = false;
        } else {
            uploadButton.disabled = true;
        }
    });

    window.addEventListener('beforeunload', () => {
        deductionTypeSelect.selectedIndex = 0;
        loanExcelFile.disabled = true;
    });
});