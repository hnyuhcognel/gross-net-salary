const INSURANCE_RATE = 0.105;
const DEDUCTION_TAXPAYER = 15500000;
const DEDUCTION_DEPENDENT = 6200000;

// Cập nhật Mức trần BHXH/BHYT (2026 DỰ KIẾN) dựa trên Nghị định 73/2024/NĐ-CP
// Mức lương cơ sở 2.340.000 VNĐ -> 20 x 2.340.000 = 46.800.000 VNĐ.
const BHXH_BHYT_MAX = 46800000;

const REGION_MIN_WAGES = {
    '1': 5310000,
    '2': 4730000,
    '3': 4140000,
    '4': 3700000
};

const BHTN_CAPS = {
    '1': REGION_MIN_WAGES['1'] * 20,
    '2': REGION_MIN_WAGES['2'] * 20,
    '3': REGION_MIN_WAGES['3'] * 20,
    '4': REGION_MIN_WAGES['4'] * 20
};

const PIT_BRACKETS = [
    { limit: 10000000, rate: 0.05, cumulativeTax: 0 },
    { limit: 30000000, rate: 0.10, cumulativeTax: 500000 },
    { limit: 60000000, rate: 0.20, cumulativeTax: 2500000 },
    { limit: 100000000, rate: 0.30, cumulativeTax: 8500000 },
    { limit: Infinity, rate: 0.35, cumulativeTax: 20500000 }
];

const formatVND = (amount) => {
    // Format cho hiển thị kết quả (có kèm VNĐ)
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Math.max(0, amount));
};

// --- HÀM XỬ LÝ FORMATTING INPUT ---

// Loại bỏ dấu phân cách (dấu chấm) để lấy giá trị số nguyên
function unformatNumberInput(formattedValue) {
    if (!formattedValue) return '';
    // Loại bỏ tất cả các dấu chấm
    return formattedValue.toString().replace(/\./g, '');
}

// Định dạng giá trị số nguyên thành chuỗi có dấu phân cách
function formatNumberInput(value) {
    const unformattedValue = unformatNumberInput(value);
    if (unformattedValue === '') return '';

    // Sử dụng Number().toLocaleString() để định dạng số theo chuẩn Việt Nam
    return Number(unformattedValue).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
}

function attachInputFormattingHandlers() {
    const salaryInputs = document.querySelectorAll('#inputSalary, #insuranceSalary');

    salaryInputs.forEach(input => {
        // Gắn sự kiện 'input' để định dạng ngay khi người dùng gõ
        input.addEventListener('input', (event) => {
            const oldValue = event.target.value;
            const unformattedValue = unformatNumberInput(oldValue);

            // Kiểm tra xem giá trị mới có hợp lệ (chỉ chứa số) không
            if (!/^\d*$/.test(unformattedValue)) {
                // Nếu không hợp lệ, chỉ giữ lại phần số
                event.target.value = formatNumberInput(unformattedValue.replace(/[^0-9]/g, ''));
                return;
            }

            // Định dạng lại giá trị
            event.target.value = formatNumberInput(unformattedValue);
        });

        // Định dạng giá trị mặc định '0' khi tải trang
        input.value = formatNumberInput(input.value);
    });
}

// --- HÀM XỬ LÝ FOCUS/BLUR (TỰ ĐỘNG XÓA 0) ---

function handleInputFocus(event) {
    // Xóa giá trị '0' (đã được định dạng thành '0') và xóa luôn định dạng khi focus
    if (event.target.value === '0') {
        event.target.value = '';
    } else {
        // Loại bỏ dấu phân cách khi focus để dễ dàng chỉnh sửa
        event.target.value = unformatNumberInput(event.target.value);
    }
}

function handleInputBlur(event) {
    // Lấy giá trị đã unformat
    let value = unformatNumberInput(event.target.value);

    // Nếu người dùng rời khỏi ô input mà không nhập gì hoặc giá trị là 0, đặt lại là 0 (đã định dạng)
    if (value === '' || Number(value) === 0) {
        event.target.value = '0';
    } else {
        // Định dạng lại giá trị khi blur
        event.target.value = formatNumberInput(value);
    }
}

// --- HÀM TÍNH TOÁN CỐT LÕI ---

function calculatePIT(taxableIncome) {
    if (taxableIncome <= 0) {
        return 0;
    }

    let pit = 0;
    let previousLimit = 0;

    for (let i = 0; i < PIT_BRACKETS.length; i++) {
        const bracket = PIT_BRACKETS[i];

        if (taxableIncome <= bracket.limit) {
            const incomeInBracket = taxableIncome - previousLimit;
            pit = bracket.cumulativeTax + (incomeInBracket * bracket.rate);
            return pit;
        } else {
            previousLimit = bracket.limit;
        }
    }
    return pit;
}

function calculateGrossToNet(grossSalary, insuranceSalary, dependents, selectedRegion) {
    const bhtnCap = BHTN_CAPS[selectedRegion];

    const bhxhBHYTSalary = Math.min(insuranceSalary, BHXH_BHYT_MAX);
    const bhxhBHYT = bhxhBHYTSalary * 0.095;

    const bhtnSalary = Math.min(insuranceSalary, bhtnCap);
    const bhtn = bhtnSalary * 0.01;

    const mandatoryInsurance = bhxhBHYT + bhtn;

    const totalDeductions = DEDUCTION_TAXPAYER + (dependents * DEDUCTION_DEPENDENT);
    const taxableIncome = grossSalary - mandatoryInsurance - totalDeductions;
    const pitAmount = calculatePIT(taxableIncome);

    const netSalary = grossSalary - mandatoryInsurance - pitAmount;

    return { netSalary, mandatoryInsurance, totalDeductions, taxableIncome, pitAmount, bhxhBHYTSalary, bhtn, bhxhBHYT };
}

function calculateNetToGross(netSalary, insuranceSalaryOption, dependents, selectedRegion) {
    let grossGuess = netSalary * 1.1;
    const MAX_ITERATIONS = 100;
    const TOLERANCE = 1;

    const totalDeductions = DEDUCTION_TAXPAYER + (dependents * DEDUCTION_DEPENDENT);

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        let currentInsuranceSalary;

        if (insuranceSalaryOption === 'same') {
            currentInsuranceSalary = grossGuess;
        } else {
            // Lấy giá trị đã unformat để tính toán
            currentInsuranceSalary = parseFloat(unformatNumberInput(document.getElementById('insuranceSalary').value)) || 0;
        }

        const result = calculateGrossToNet(grossGuess, currentInsuranceSalary, dependents, selectedRegion);
        const netCalculated = result.netSalary;
        const difference = netSalary - netCalculated;

        if (Math.abs(difference) <= TOLERANCE) {
            return { grossSalary: grossGuess, details: result };
        }

        let marginalRate = 0.35;
        let taxableIncomeGuess = grossGuess - result.mandatoryInsurance - totalDeductions;

        for (let j = 0; j < PIT_BRACKETS.length; j++) {
            if (taxableIncomeGuess <= PIT_BRACKETS[j].limit) {
                marginalRate = PIT_BRACKETS[j].rate;
                break;
            }
        }

        let marginalInsRate = (insuranceSalaryOption === 'same' && grossGuess <= BHXH_BHYT_MAX && grossGuess <= BHTN_CAPS[selectedRegion]) ? INSURANCE_RATE : 0;

        grossGuess = grossGuess + difference / (1 - marginalRate - marginalInsRate);

        if (grossGuess < 0) grossGuess = netSalary;
    }

    const currentInsuranceSalary = insuranceSalaryOption === 'same' ? grossGuess : parseFloat(unformatNumberInput(document.getElementById('insuranceSalary').value)) || 0;
    const finalResult = calculateGrossToNet(grossGuess, currentInsuranceSalary, dependents, selectedRegion);
    return { grossSalary: grossGuess, details: finalResult };
}


// ----------------------------------------------------------------------
// CHUYỂN ĐỔI CHẾ ĐỘ & HIỂN THỊ
// ----------------------------------------------------------------------

let currentMode = 'GROSS_TO_NET';

function setMode(mode) {
    currentMode = mode;
    const inputLabel = document.querySelector('label[for="inputSalary"]');
    const grossNetBtn = document.getElementById('grossNetBtn');
    const netGrossBtn = document.getElementById('netGrossBtn');

    if (mode === 'GROSS_TO_NET') {
        inputLabel.textContent = 'Nhập Lương Gross (VNĐ):';
        grossNetBtn.classList.add('active');
        netGrossBtn.classList.remove('active');
    } else {
        inputLabel.textContent = 'Nhập Lương Net Mục Tiêu (VNĐ):';
        netGrossBtn.classList.add('active');
        grossNetBtn.classList.remove('active');
    }

    document.getElementById('results').innerHTML = '<p>Nhấn nút **Tính** để xem kết quả.</p>';
}

function setupInsuranceInput() {
    const insSameAsGross = document.getElementById('insSameAsGross');
    const insCustom = document.getElementById('insCustom');
    const insuranceSalaryInput = document.getElementById('insuranceSalary');

    insSameAsGross.addEventListener('change', () => {
        insuranceSalaryInput.disabled = true;
    });

    insCustom.addEventListener('change', () => {
        insuranceSalaryInput.disabled = false;
    });
}

function attachFocusHandlers() {
    const salaryInputs = document.querySelectorAll('#inputSalary, #insuranceSalary, #dependents');
    salaryInputs.forEach(input => {
        input.addEventListener('focus', handleInputFocus);
        input.addEventListener('blur', handleInputBlur);
    });
}


function calculateAndDisplay() {
    // Lấy giá trị đã unformat để tính toán
    const inputSalaryUnformatted = unformatNumberInput(document.getElementById('inputSalary').value);
    const inputSalaryValue = parseFloat(inputSalaryUnformatted);

    const dependents = parseInt(document.getElementById('dependents').value) || 0;
    const selectedRegion = document.querySelector('input[name="region"]:checked').value;
    const isCustomIns = document.getElementById('insCustom').checked;
    const insuranceSalaryOption = isCustomIns ? 'custom' : 'same';

    const insuranceSalaryManualUnformatted = unformatNumberInput(document.getElementById('insuranceSalary').value);
    const insuranceSalaryManual = parseFloat(insuranceSalaryManualUnformatted);

    const resultsDiv = document.getElementById('results');

    // 1. Kiểm tra Lương Chính (Gross hoặc Net Target)
    if (isNaN(inputSalaryValue) || inputSalaryValue <= 0) {
        resultsDiv.innerHTML = '<p style="color: red;">Vui lòng nhập mức lương hợp lệ lớn hơn 0 vào ô **Nhập Lương (VNĐ)**.</p>';
        return;
    }

    let finalGross;
    let details;
    let inputTitle;
    let outputTitle;
    let insuranceSalary;

    // 2. Kiểm tra Lương đóng BH thủ công (nếu được chọn)
    if (isCustomIns) {
        if (isNaN(insuranceSalaryManual) || insuranceSalaryManual <= 0) {
            resultsDiv.innerHTML = '<p style="color: red;">Vui lòng nhập mức Lương đóng bảo hiểm hợp lệ lớn hơn 0.</p>';
            return;
        }
        insuranceSalary = insuranceSalaryManual;
    }


    if (currentMode === 'GROSS_TO_NET') {
        if (!isCustomIns) {
            insuranceSalary = inputSalaryValue;
        }

        details = calculateGrossToNet(inputSalaryValue, insuranceSalary, dependents, selectedRegion);
        finalGross = inputSalaryValue;
        outputTitle = 'LƯƠNG NET (Thực nhận):';
        inputTitle = 'Lương Gross Nhập:';
    } else { // NET_TO_GROSS
        const result = calculateNetToGross(inputSalaryValue, insuranceSalaryOption, dependents, selectedRegion);
        finalGross = result.grossSalary;
        details = result.details;
        outputTitle = 'LƯƠNG GROSS Cần Thiết:';
        inputTitle = 'Lương Net Mục Tiêu:';
    }

    // Lấy chi tiết tính toán
    const { netSalary, mandatoryInsurance, totalDeductions, taxableIncome, pitAmount, bhxhBHYTSalary, bhtn, bhxhBHYT } = details;
    const regionWage = REGION_MIN_WAGES[selectedRegion];

    // Xác định kết quả cuối cùng để hiển thị ở dòng nổi bật
    const finalResultDisplay = currentMode === 'GROSS_TO_NET' ? netSalary : finalGross;
    const auxiliaryResultDisplay = netSalary;

    // Hiển thị kết quả
    let htmlContent = `
        <div class="result-item">
            <span>${inputTitle}</span>
            <span class="positive">${formatVND(inputSalaryValue)}</span>
        </div>

        <div style="margin-top: 15px;"></div>
        <div class="result-item">
            <span>Giảm trừ (Bản thân + NPT):</span>
            <span class="positive">${formatVND(totalDeductions)}</span>
        </div>
        <div class="result-item">
            <span>BHXH/BHYT (9.5% trên ${formatVND(bhxhBHYTSalary)}):</span>
            <span class="negative">- ${formatVND(bhxhBHYT)}</span>
        </div>
        <div class="result-item">
            <span>BHTN (1% trên LTT Vùng ${selectedRegion} ${formatVND(regionWage)}):</span>
            <span class="negative">- ${formatVND(bhtn)}</span>
        </div>
        <div class="result-item">
            <span>Tổng Bảo hiểm Bắt buộc:</span>
            <span class="negative">- ${formatVND(mandatoryInsurance)}</span>
        </div>
        <div class="result-item">
            <span>Thu nhập Tính thuế (TNCN):</span>
            <span class="positive">${formatVND(Math.max(0, taxableIncome))}</span>
        </div>
        <div class="result-item">
            <span>Thuế Thu nhập Cá nhân (PIT):</span>
            <span class="negative">- ${formatVND(pitAmount)}</span>
        </div>

        <div class="result-item net-salary-item">
            <span>${outputTitle}</span>
            <span class="positive">${formatVND(finalResultDisplay)}</span>
        </div>
    `;

    resultsDiv.innerHTML = htmlContent;
}

document.addEventListener('DOMContentLoaded', () => {
    setupInsuranceInput();
    setMode('GROSS_TO_NET');

    // Gán handlers cho việc định dạng và focus
    attachFocusHandlers();
    attachInputFormattingHandlers();

    document.getElementById('grossNetBtn').addEventListener('click', calculateAndDisplay);
    document.getElementById('netGrossBtn').addEventListener('click', calculateAndDisplay);

    document.getElementById('results').innerHTML = '<p>Nhấn nút **Tính** để xem kết quả.</p>';
});