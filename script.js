const GST_RATE = 0.09;
const WHATSAPP_NUMBER = "+6583963088";
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyGFLMQqS42t-ZGHyhnYBgYv3kILp9IhY903xXVbSEH3vv_SIaEmX9o-aohJ_nynu-ncA/exec";

const state = {
  mode: "seller",
};

const money = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
  maximumFractionDigits: 0,
});

const $ = (id) => document.getElementById(id);

function cleanNumber(value) {
  return Number(String(value || "").replace(/[^\d.-]/g, "")) || 0;
}

function num(id) {
  const input = $(id);
  return cleanNumber(input ? input.value : 0);
}

function formatMoneyInput(input) {
  input.value = money.format(Math.max(cleanNumber(input.value), 0));
}

function clampDeposit(id) {
  const input = $(id);
  const value = cleanNumber(input.value);
  if (value > 5000) input.value = money.format(5000);
  if (value < 0) input.value = money.format(0);
}

function buyerStampDuty(amount) {
  const tiers = [
    [180000, 0.01],
    [180000, 0.02],
    [640000, 0.03],
    [500000, 0.04],
    [1500000, 0.05],
    [Infinity, 0.06],
  ];

  let remaining = amount;
  let duty = 0;

  for (const [cap, rate] of tiers) {
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, cap);
    duty += taxable * rate;
    remaining -= taxable;
  }

  return Math.floor(Math.max(duty, amount > 0 ? 1 : 0));
}

function commissionWithGst(base, rate, enabled) {
  if (!enabled) return 0;
  const commission = base * (rate / 100);
  return commission + commission * GST_RATE;
}

function setBreakdown(rows) {
  $("breakdown").innerHTML = rows
    .map(
      (row) => `
        <div class="breakdown-row ${row.className || ""}">
          <span>${row.label}</span>
          <strong>${money.format(row.value)}</strong>
        </div>
      `
    )
    .join("");
}

function setGroupedBreakdown(groups) {
  $("breakdown").innerHTML = groups
    .map((group) => {
      const heading = group.title ? `<div class="breakdown-heading">${group.title}</div>` : "";
      const rows = group.rows
        .map(
          (row) => `
            <div class="breakdown-row ${row.className || ""}">
              <span>${row.label}</span>
              <strong>${money.format(row.value)}</strong>
            </div>
          `
        )
        .join("");
      return `<section class="breakdown-group">${heading}${rows}</section>`;
    })
    .join("");
}

function getSellerData() {
  const sellingPrice = num("sellingPrice");
  const outstandingLoan = num("sellerLoan");
  const cpfRefund = num("cpfRefund");
  const outstandingHip = num("outstandingHip");
  const bankPenalty = num("bankPenalty");
  const resaleLevy = num("resaleLevy");
  const legal = num("sellerLegal");
  const misc = num("sellerMisc");
  const commission = commissionWithGst(
    sellingPrice,
    num("sellerCommissionRate"),
    $("sellerCommissionOn").checked
  );

  const proceeds =
    sellingPrice -
    outstandingLoan -
    cpfRefund -
    outstandingHip -
    bankPenalty -
    resaleLevy -
    legal -
    misc -
    commission;

  return {
    proceeds,
    rows: [
      { label: "Selling price", value: sellingPrice, className: "highlight" },
      { label: "Outstanding loan", value: -outstandingLoan },
      { label: "CPF refund", value: -cpfRefund },
      { label: "Outstanding HIP", value: -outstandingHip },
      { label: "Bank penalty", value: -bankPenalty },
      { label: "Resale levy", value: -resaleLevy },
      { label: "Legal fee", value: -legal },
      { label: "Miscellaneous fee", value: -misc },
      { label: "Agent commission + GST", value: -commission },
    ],
  };
}

function getBuyerData() {
  const purchasePrice = num("purchasePrice");
  const valuation = num("valuation");
  const loanValue = Math.min(purchasePrice, valuation || purchasePrice);
  const keyedLoan = $("loanType").value === "No loan" ? 0 : num("approvedLoan");
  const maxLoan = $("loanType").value === "No loan" ? 0 : loanValue * 0.75;
  const loan = Math.min(keyedLoan, maxLoan);
  const loanShortfall = $("loanType").value === "No loan" ? 0 : Math.max(maxLoan - loan, 0);
  const cpf = num("cpfAvailable");
  const stampDutyBase = Math.max(purchasePrice, valuation);
  const bsd = buyerStampDuty(stampDutyBase);
  const absdRate = Number($("absdProfile").value);
  const absd = stampDutyBase * (absdRate / 100);
  const legal = num("buyerLegal");
  const misc = num("buyerMisc");
  const valuationGap = Math.max(purchasePrice - loanValue, 0);
  const minimumCashDownpayment = $("loanType").value === "No loan" ? purchasePrice : loanValue * 0.05;
  const commission = commissionWithGst(
    purchasePrice,
    num("buyerCommissionRate"),
    $("buyerCommissionOn").checked
  );

  const totalCashAndCpfNeeded =
    purchasePrice +
    bsd +
    absd +
    legal +
    misc +
    commission -
    loan;

  const cashNeededAfterCpf = Math.max(totalCashAndCpfNeeded - cpf, 0);

  return {
    required: totalCashAndCpfNeeded,
    cashNeededAfterCpf,
    rows: [
      { label: "Purchase price", value: purchasePrice, className: "highlight" },
      { label: "Bank / market valuation", value: valuation },
      { label: "Stamp duty basis", value: stampDutyBase },
      { label: "Buyer Stamp Duty", value: bsd },
      { label: `ABSD at ${absdRate}%`, value: absd, className: absd > 0 ? "warning" : "" },
      { label: "Legal fee", value: legal },
      { label: "Miscellaneous fee", value: misc },
      { label: "Agent commission + GST", value: commission },
      { label: "Max bank loan at 75% LTV", value: maxLoan },
      { label: "Approved loan", value: -loan },
      ...(loanShortfall > 0
        ? [{ label: "Loan shortfall to be funded", value: loanShortfall, className: "warning" }]
        : []),
      { label: "Estimated cash and/or CPF needed", value: totalCashAndCpfNeeded, className: "highlight" },
      { label: "Minimum 5% cash downpayment guide", value: minimumCashDownpayment, className: "warning" },
      { label: "Price above bank valuation", value: valuationGap, className: valuationGap > 0 ? "warning" : "" },
      { label: "Total OA available", value: -cpf },
      { label: "Estimated cash needed after CPF", value: cashNeededAfterCpf, className: "highlight" },
    ],
  };
}

function renderSeller() {
  const seller = getSellerData();
  $("resultKicker").textContent = "Estimated seller cash proceeds";
  $("resultTotal").textContent = money.format(seller.proceeds);
  $("quickTotal").textContent = money.format(seller.proceeds);
  $("quickLabel").textContent = "Estimated sale proceeds";
  setBreakdown(seller.rows);
}

function renderBuyer() {
  const buyer = getBuyerData();
  $("resultKicker").textContent = "Estimated cash and/or CPF needed";
  $("resultTotal").textContent = money.format(buyer.required);
  $("quickTotal").textContent = money.format(buyer.required);
  $("quickLabel").textContent = "Estimated total needed";
  setBreakdown(buyer.rows);
}

function renderBoth() {
  const seller = getSellerData();
  const buyer = getBuyerData();
  const net = seller.proceeds - buyer.required;

  $("resultKicker").textContent = "Estimated net position";
  $("resultTotal").textContent = money.format(net);
  $("quickTotal").textContent = money.format(net);
  $("quickLabel").textContent = "Estimated balance after using HDB sale proceeds for condo purchase";

  setGroupedBreakdown([
    {
      title: "Overall",
      rows: [
        { label: "Estimated sale proceeds", value: seller.proceeds, className: "highlight" },
        { label: "Estimated cash and/or CPF needed", value: buyer.required, className: "highlight" },
      ],
    },
    {
      title: "Selling",
      rows: [
        ...seller.rows,
        { label: "Estimated sale proceeds", value: seller.proceeds, className: "highlight" },
      ],
    },
    {
      title: "Buying",
      rows: [
        ...buyer.rows,
        { label: "Estimated cash and/or CPF needed", value: buyer.required, className: "highlight" },
      ],
    },
  ]);
}

function getModeLabel() {
  if (state.mode === "seller") return "I am selling";
  return "I am buying and selling";
}

function getCurrentEstimate() {
  if (state.mode === "seller") {
    const seller = getSellerData();
    return {
      mode: getModeLabel(),
      resultLabel: "Estimated seller cash proceeds",
      resultTotal: money.format(seller.proceeds),
      rows: seller.rows,
    };
  }

  const seller = getSellerData();
  const buyer = getBuyerData();
  const net = seller.proceeds - buyer.required;
  return {
    mode: getModeLabel(),
    resultLabel: "Estimated net position",
    resultTotal: money.format(net),
    rows: [
      ...seller.rows,
      { label: "Estimated sale proceeds", value: seller.proceeds },
      ...buyer.rows,
      { label: "Estimated cash and/or CPF needed", value: buyer.required },
      { label: "Estimated net balance", value: net },
    ],
  };
}

function estimateSummary() {
  const estimate = getCurrentEstimate();

  if (state.mode === "both") {
    const seller = getSellerData();
    const buyer = getBuyerData();
    const net = seller.proceeds - buyer.required;
    const sellerLines = [
      ...seller.rows,
      { label: "Estimated sale proceeds", value: seller.proceeds },
    ];
    const buyerLines = buyer.rows;

    return [
      `Mode: ${estimate.mode}`,
      `${estimate.resultLabel}: ${estimate.resultTotal}`,
      `Estimated cash and/or CPF needed: ${money.format(buyer.required)}`,
      `Estimated net balance: ${money.format(net)}`,
      "",
      ...sellerLines.map((row) => `${row.label}: ${money.format(row.value)}`),
      "",
      "",
      ...buyerLines.map((row) => `${row.label}: ${money.format(row.value)}`),
    ].join("\n");
  }

  const lines = [
    `Mode: ${estimate.mode}`,
    `${estimate.resultLabel}: ${estimate.resultTotal}`,
    "",
    ...estimate.rows.map((row) => `${row.label}: ${money.format(row.value)}`),
  ];
  return lines.join("\n");
}

function inputValue(label, id) {
  return { label, value: $(id).value || money.format(0) };
}

function fullInputDetails() {
  const sellerInputs = [
    inputValue("Selling price", "sellingPrice"),
    inputValue("Outstanding loan", "sellerLoan"),
    inputValue("CPF refund with accrued interest", "cpfRefund"),
    inputValue("Outstanding HIP, if any", "outstandingHip"),
    inputValue("Bank penalty, if any", "bankPenalty"),
    inputValue("Resale levy, if applicable", "resaleLevy"),
    inputValue("Seller legal fee", "sellerLegal"),
    inputValue("Seller miscellaneous fee", "sellerMisc"),
    { label: "Seller agent commission + GST", value: $("sellerCommissionOn").checked ? `${$("sellerCommissionRate").value}%` : "Not included" },
  ];

  const buyerInputs = [
    inputValue("Private condo purchase price", "purchasePrice"),
    inputValue("Bank / market valuation", "valuation"),
    { label: "Loan type", value: $("loanType").value },
    inputValue("Approved loan amount", "approvedLoan"),
    inputValue("Total OA available", "cpfAvailable"),
    { label: "ABSD profile", value: $("absdProfile").selectedOptions[0].textContent },
    inputValue("Buyer legal fee", "buyerLegal"),
    inputValue("Buyer miscellaneous fee", "buyerMisc"),
    { label: "Buyer agent commission + GST", value: $("buyerCommissionOn").checked ? `${$("buyerCommissionRate").value}%` : "Not included" },
  ];

  if (state.mode === "seller") return sellerInputs;
  return [...sellerInputs, ...buyerInputs];
}

function fullInputSummary() {
  return fullInputDetails()
    .map((item) => `${item.label}: ${item.value}`)
    .join("\n");
}

function leadPayload() {
  const estimate = getCurrentEstimate();
  return {
    name: $("leadName").value.trim(),
    phone: $("leadPhone").value.trim(),
    contactTime: $("leadContactTime").value,
    notes: $("leadNotes").value.trim(),
    mode: estimate.mode,
    resultLabel: estimate.resultLabel,
    resultTotal: estimate.resultTotal,
    inputs: fullInputDetails(),
    inputSummary: fullInputSummary(),
    summary: estimateSummary(),
    dataConsent: $("dataConsent").checked,
  };
}

function updateLeadPreview() {
  const preview = $("leadEstimatePreview");
  if (preview) preview.textContent = estimateSummary();
}

async function submitLead(payload) {
  if (!GOOGLE_SCRIPT_URL) return { skipped: true };

  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });

  return { ok: true, response };
}

function openWhatsapp(payload) {
  const message = [
    "Hi, I used your HDB sale and condo purchase calculator and would like to sense-check my figures.",
    "",
    `Name: ${payload.name}`,
    `WhatsApp: ${payload.phone}`,
    `Preferred contact time: ${payload.contactTime}`,
    "",
    "Figures keyed in:",
    payload.inputSummary,
    "",
    "Calculated estimate:",
    payload.summary,
    "",
    `Notes: ${payload.notes || "-"}`,
  ].join("\n");

  const phone = WHATSAPP_NUMBER.replace(/[^\d]/g, "");
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
}

function updateCommissionVisibility() {
  $("sellerCommissionFields").classList.toggle("muted", !$("sellerCommissionOn").checked);
  $("buyerCommissionFields").classList.toggle("muted", !$("buyerCommissionOn").checked);
}

function updatePanels() {
  $("sellerPanel").classList.toggle("active", state.mode === "seller" || state.mode === "both");
  $("buyerPanel").classList.toggle("active", state.mode === "both");
  $("calculator").classList.toggle("combined", state.mode === "both");
}

function calculate() {
  updateCommissionVisibility();
  if (state.mode === "seller") renderSeller();
  else renderBoth();
}

document.querySelectorAll(".mode-btn").forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    document.querySelectorAll(".mode-btn").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    updatePanels();
    calculate();
  });
});

document.querySelectorAll("input, select").forEach((input) => {
  input.addEventListener("input", calculate);
  input.addEventListener("change", calculate);
});

document.querySelectorAll(".money-input").forEach((input) => {
  input.addEventListener("focus", () => {
    input.value = cleanNumber(input.value) || "";
  });
  input.addEventListener("blur", () => {
    formatMoneyInput(input);
    calculate();
  });
  formatMoneyInput(input);
});

$("openLeadForm").addEventListener("click", () => {
  updateLeadPreview();
  $("leadModal").hidden = false;
  $("leadName").focus();
});

$("closeLeadForm").addEventListener("click", () => {
  $("leadModal").hidden = true;
});

$("leadModal").addEventListener("click", (event) => {
  if (event.target === $("leadModal")) $("leadModal").hidden = true;
});

$("leadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("leadName").value.trim();
  const phone = $("leadPhone").value.trim();

  if (!name || !phone) {
    $("leadStatus").textContent = "Please enter your name and WhatsApp number before submitting.";
    if (!name) $("leadName").focus();
    else $("leadPhone").focus();
    return;
  }

  if (!$("dataConsent").checked) {
    $("leadStatus").textContent = "Please acknowledge the data collection notice before submitting.";
    return;
  }

  const payload = leadPayload();
  $("leadStatus").textContent = "Preparing your estimate and opening WhatsApp...";

  try {
    const result = await submitLead(payload);
    $("leadStatus").textContent = result.skipped
      ? "WhatsApp is opening now. Google Sheets logging will start after the Apps Script URL is added."
      : "Submitted. WhatsApp is opening now.";
  } catch (error) {
    $("leadStatus").textContent = "WhatsApp is opening now. Google Sheets logging could not be completed.";
  }

  openWhatsapp(payload);
});

updatePanels();
calculate();
