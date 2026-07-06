const GST_RATE = 0.09;
const WHATSAPP_NUMBER = "+6583963088";
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyGFLMQqS42t-ZGHyhnYBgYv3kILp9IhY903xXVbSEH3vv_SIaEmX9o-aohJ_nynu-ncA/exec";
const HDB_LOAN_LTV = 0.75;
const BANK_LOAN_LTV = 0.75;

const state = {
  mode: "seller",
  leadSubmitted: false,
  valuationEdited: false,
  secondHdbPaydownEdited: false,
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
  if (!String(input.value || "").match(/\d/)) {
    input.value = "";
    return;
  }
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

function hasKeyedAmount(id) {
  const input = $(id);
  return Boolean(input && String(input.value || "").match(/\d/));
}

function commissionWithGst(base, rate, enabled, overrideId) {
  if (!enabled) return 0;
  if (overrideId && hasKeyedAmount(overrideId)) return num(overrideId);
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
    $("sellerCommissionOn").checked,
    "sellerCommissionOverride"
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
      { label: "Miscellaneous fee (cash only)", value: -misc },
      { label: "Agent commission + GST (cash only)", value: -commission },
    ],
  };
}

function getBuyerData() {
  const isHdbPurchase = state.mode === "hdb";
  const purchasePrice = num("purchasePrice");
  const valuation = isHdbPurchase ? num("valuation") : purchasePrice;
  const loanValue = Math.min(purchasePrice, valuation || purchasePrice);
  const loanType = $("loanType").value;
  const keyedLoan = loanType === "No loan" ? 0 : num("approvedLoan");
  const loanRate = loanType === "HDB loan" ? HDB_LOAN_LTV : BANK_LOAN_LTV;
  const maxLoan = loanType === "No loan" ? 0 : loanValue * loanRate;
  const loan = Math.min(keyedLoan, maxLoan);
  const secondHdbLoanPaydown =
    isHdbPurchase && loanType === "HDB loan"
      ? Math.min(num("secondHdbPaydown"), loan)
      : 0;
  const loanUsed = Math.max(loan - secondHdbLoanPaydown, 0);
  const loanShortfall = loanType === "No loan" ? 0 : Math.max(maxLoan - loan, 0);
  const cpf = num("cpfAvailable");
  const grant = isHdbPurchase ? num("buyerGrant") : 0;
  const stampDutyBase = Math.max(purchasePrice, valuation);
  const bsd = buyerStampDuty(stampDutyBase);
  const absdRate = Number($("absdProfile").value);
  const absd = stampDutyBase * (absdRate / 100);
  const legal = num("buyerLegal");
  const misc = num("buyerMisc");
  const valuationGap = Math.max(purchasePrice - loanValue, 0);
  const downpaymentRows =
    loanType === "No loan"
      ? [{ label: "No loan purchase amount", value: purchasePrice, className: "warning" }]
      : loanType === "HDB loan"
        ? [{ label: "25% downpayment by Cash/CPF", value: loanValue * 0.25, className: "warning" }]
        : [
            { label: "20% downpayment by Cash/CPF", value: loanValue * 0.2, className: "warning" },
            { label: "5% downpayment cash", value: loanValue * 0.05, className: "warning" },
          ];
  const commission = commissionWithGst(
    purchasePrice,
    num("buyerCommissionRate"),
    $("buyerCommissionOn").checked,
    "buyerCommissionOverride"
  );

  const totalCashAndCpfNeeded =
    purchasePrice +
    bsd +
    absd +
    legal +
    misc +
    commission -
    loanUsed -
    grant;
  const cashOnlyCosts = misc + commission;
  const cpfEligibleNeeded = Math.max(totalCashAndCpfNeeded - cashOnlyCosts, 0);
  const cpfUsed = Math.min(cpf, cpfEligibleNeeded);
  const cashNeededBeforeSale = cashOnlyCosts + Math.max(cpfEligibleNeeded - cpf, 0);

  const purchaseLabel = isHdbPurchase ? "Next HDB purchase price" : "Private condo purchase price";
  const valuationLabel = isHdbPurchase ? "Valuation" : "Bank Valuation";
  const ltvLabel = loanType === "HDB loan" ? "Max HDB loan at 75% LTV" : "Max bank loan at 75% LTV";
  const buyerRows = [
    { label: purchaseLabel, value: purchasePrice, className: "highlight" },
    ...downpaymentRows,
    { label: ltvLabel, value: maxLoan },
    { label: "Approved loan", value: -loan },
    ...(secondHdbLoanPaydown > 0
      ? [
          { label: "Second HDB loan cash proceeds paydown", value: secondHdbLoanPaydown, className: "warning" },
          { label: "Net loan after paydown", value: -loanUsed },
        ]
      : []),
    ...(isHdbPurchase ? [{ label: valuationLabel, value: valuation }] : []),
    { label: "Stamp duty basis", value: stampDutyBase },
    { label: "Buyer Stamp Duty", value: bsd },
    { label: `ABSD at ${absdRate}%`, value: absd, className: absd > 0 ? "warning" : "" },
    ...(absd > 0 ? [{ label: "Total stamp duty amount", value: bsd + absd, className: "highlight" }] : []),
    { label: "Legal fee", value: legal },
    { label: "Miscellaneous fee (cash only)", value: misc },
    { label: "Agent commission + GST (cash only)", value: commission },
    ...(loanShortfall > 0
      ? [{ label: "Loan shortfall to be funded", value: loanShortfall, className: "warning" }]
      : []),
    ...(isHdbPurchase ? [{ label: "Cash Over Valuation (COV)", value: valuationGap, className: valuationGap > 0 ? "warning" : "" }] : []),
    { label: "CPF OA used", value: -cpfUsed },
    { label: "Grant amount", value: -grant },
    { label: "Cash needed before estimated HDB sale proceeds", value: cashNeededBeforeSale, className: "highlight" },
  ];

  return {
    required: totalCashAndCpfNeeded,
    cpf,
    cpfUsed,
    cashOnlyCosts,
    cashNeededBeforeSale,
    secondHdbLoanPaydown,
    cov: isHdbPurchase ? valuationGap : 0,
    rows: buyerRows,
  };
}

function cashTopUpAfterCpfAndSale(seller, buyer) {
  return Math.max(buyer.cashNeededBeforeSale - seller.proceeds, 0);
}

function combinedBuyingRows(seller, buyer) {
  const topUp = cashTopUpAfterCpfAndSale(seller, buyer);
  const saleProceedsOffset = seller.proceeds >= 0 ? -seller.proceeds : seller.proceeds;
  return [
    ...buyer.rows,
    { label: "Estimated HDB sale proceeds", value: saleProceedsOffset, className: seller.proceeds < 0 ? "warning" : "highlight" },
    {
      label: "Estimated cash top-up needed after CPF OA, grant and estimated HDB sale proceeds",
      value: topUp,
      className: "highlight",
    },
  ];
}

function getHealthSnapshot() {
  if (state.mode === "seller") {
    const seller = getSellerData();
    const status = seller.proceeds >= 200000 ? "Healthy" : seller.proceeds >= 80000 ? "Worth Planning" : "Review first before proceeding";
    const tone = status === "Healthy" ? "healthy" : status === "Worth Planning" ? "planning" : "review";
    const reason = seller.proceeds >= 0
      ? `Estimated sale proceeds are ${money.format(seller.proceeds)} after the keyed-in loan, CPF refund, fees, and commission.`
      : `The keyed-in sale figures show a shortfall of ${money.format(Math.abs(seller.proceeds))}, so the selling position may need closer review.`;

    return {
      status,
      tone,
      rows: [
        { title: "Sale position", text: reason },
        { title: "Suggested next step", text: "A follow-up review can help clarify the sale timeline, expected cash position, and suitable next steps before making a decision." },
      ],
    };
  }

  const seller = getSellerData();
  const buyer = getBuyerData();
  const topUp = cashTopUpAfterCpfAndSale(seller, buyer);
  const reasons = [];
  const saleShortfall = Math.abs(Math.min(seller.proceeds, 0));
  if (saleShortfall > 0) reasons.push(`negative sale proceeds of ${money.format(saleShortfall)} will add to the cash top-up needed`);
  if (topUp > 200000) reasons.push(`estimated cash top-up is above ${money.format(200000)}`);
  if (buyer.cov > 0) reasons.push(`Cash Over Valuation is ${money.format(buyer.cov)}`);

  let status = "Healthy";
  if (saleShortfall > 0 || topUp > 200000 || reasons.length >= 2) status = "Review first before proceeding";
  else if (reasons.length === 1) status = "Worth Planning";
  const tone = status === "Healthy" ? "healthy" : status === "Worth Planning" ? "planning" : "review";
  const modeText = state.mode === "hdb" ? "next HDB purchase" : "condo upgrade";
  const reasonText = saleShortfall > 0
    ? `Due to the negative sale proceeds, this ${modeText} may require an estimated cash top-up of ${money.format(topUp)} after CPF OA, grant, sale shortfall, and purchase costs are considered.`
    : reasons.length
      ? `This ${modeText} may need closer planning because the ${reasons.join(", and ")}.`
      : `Based on the keyed-in figures, this ${modeText} appears to have a good starting position.`;

  return {
    status,
    tone,
    rows: [
      ...(saleShortfall > 0
        ? [{ title: "Sale position", text: `The keyed-in sale figures show a shortfall of ${money.format(saleShortfall)}, so the selling position may need closer review.` }]
        : []),
      { title: "Readiness view", text: reasonText },
      { title: "Suggested next step", text: getNextStepText(status, modeText) },
    ],
  };
}

function getNextStepText(status, modeText) {
  if (status === "Healthy") {
    return `The figures look workable as a first pass. A review can help refine the realistic ${modeText} budget, timeline, and suitable property options.`;
  }
  if (status === "Worth Planning") {
    return `The figures may still work, but the cash flow and timeline should be sense-checked before shortlisting homes.`;
  }
  return `Before proceeding, it would be useful to review the numbers together and see whether the shortfall, CPF use, or timing can be improved.`;
}

function healthSummary() {
  const snapshot = getHealthSnapshot();
  return [
    `Status: ${snapshot.status}`,
    ...snapshot.rows.map((row) => `${row.title}: ${row.text}`),
  ].join("\n");
}

function renderHealthSnapshot() {
  const snapshot = getHealthSnapshot();
  const badge = $("healthStatus");
  badge.textContent = snapshot.status;
  badge.className = `health-badge ${snapshot.tone}`;
  $("healthInsights").innerHTML = snapshot.rows
    .map((row, index) => `
      <div class="health-row">
        <span class="health-icon">${index + 1}</span>
        <span><strong>${row.title}:</strong> ${row.text}</span>
      </div>
    `)
    .join("");
}

function renderSeller() {
  const seller = getSellerData();
  $("resultKicker").textContent = "Estimated seller cash proceeds";
  $("resultTotal").textContent = money.format(seller.proceeds);
  $("quickTotal").textContent = money.format(seller.proceeds);
  $("quickLabel").textContent = "Estimated sale proceeds";
  renderHealthSnapshot();
  setBreakdown(seller.rows);
}

function renderBuyer() {
  const buyer = getBuyerData();
  $("resultKicker").textContent = "Estimated cash and/or CPF needed";
  $("resultTotal").textContent = money.format(buyer.required);
  $("quickTotal").textContent = money.format(buyer.required);
  $("quickLabel").textContent = "Estimated total needed";
  renderHealthSnapshot();
  setBreakdown(buyer.rows);
}

function renderBoth() {
  const seller = getSellerData();
  const buyer = getBuyerData();
  const topUp = cashTopUpAfterCpfAndSale(seller, buyer);
  const target = state.mode === "hdb" ? "next HDB purchase" : "condo purchase";

  $("resultKicker").textContent = "Estimated cash top-up needed";
  $("resultTotal").textContent = money.format(topUp);
  $("quickTotal").textContent = money.format(topUp);
  $("quickLabel").textContent = `After CPF OA, grant and estimated HDB sale proceeds for ${target}`;
  renderHealthSnapshot();

  setGroupedBreakdown([
    {
      title: "Selling",
      rows: [
        ...seller.rows,
        { label: "Estimated sale proceeds", value: seller.proceeds, className: "highlight" },
      ],
    },
    {
      title: "Buying",
      rows: combinedBuyingRows(seller, buyer),
    },
  ]);
}

function getModeLabel() {
  if (state.mode === "seller") return "I am Selling HDB";
  if (state.mode === "hdb") return "I am Selling HDB and Buying HDB";
  return "I am Selling HDB and Upgrading to Condo";
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
  const topUp = cashTopUpAfterCpfAndSale(seller, buyer);
  return {
    mode: getModeLabel(),
    resultLabel: "Estimated cash top-up needed after CPF OA, grant and estimated HDB sale proceeds",
    resultTotal: money.format(topUp),
    rows: [
      ...seller.rows,
      { label: "Estimated sale proceeds", value: seller.proceeds },
      ...combinedBuyingRows(seller, buyer),
      { label: "Estimated cash and/or CPF needed", value: buyer.required },
    ],
  };
}

function estimateSummary() {
  const estimate = getCurrentEstimate();

  if (state.mode === "hdb" || state.mode === "condo") {
    const seller = getSellerData();
    const buyer = getBuyerData();
    const sellerLines = [
      ...seller.rows,
      { label: "Estimated sale proceeds", value: seller.proceeds },
    ];
    const buyerLines = combinedBuyingRows(seller, buyer);

    return [
      `Mode: ${estimate.mode}`,
      `${estimate.resultLabel}: ${estimate.resultTotal}`,
      `Estimated cash and/or CPF needed: ${money.format(buyer.required)}`,
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
    inputValue("Seller miscellaneous fee (cash only)", "sellerMisc"),
    { label: "Seller agent commission + GST (cash only)", value: $("sellerCommissionOn").checked ? `${$("sellerCommissionRate").value}%` : "Not included" },
    { label: "Seller edited commission amount + GST, if any", value: $("sellerCommissionOverride").value || "Not edited" },
  ];

  const buyerInputs = [
    inputValue(state.mode === "hdb" ? "Next HDB purchase price" : "Private condo purchase price", "purchasePrice"),
    ...(state.mode === "hdb" ? [inputValue("Valuation", "valuation")] : []),
    { label: "Loan type", value: $("loanType").value },
    ...(state.mode === "hdb" && $("loanType").value === "HDB loan"
      ? [inputValue("Second HDB loan cash proceeds paydown", "secondHdbPaydown")]
      : []),
    inputValue("Approved loan amount", "approvedLoan"),
    inputValue("Total OA available", "cpfAvailable"),
    ...(state.mode === "hdb" ? [inputValue("CPF housing grants, if any", "buyerGrant")] : []),
    { label: state.mode === "hdb" ? "SPR ABSD option" : "ABSD profile", value: $("absdProfile").selectedOptions[0].textContent },
    inputValue("Buyer legal fee", "buyerLegal"),
    inputValue("Buyer miscellaneous fee (cash only)", "buyerMisc"),
    { label: "Buyer agent commission + GST (cash only)", value: $("buyerCommissionOn").checked ? `${$("buyerCommissionRate").value}%` : "Not included" },
    { label: "Buyer edited commission amount + GST, if any", value: $("buyerCommissionOverride").value || "Not edited" },
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
    analysisSummary: healthSummary(),
    dataConsent: $("dataConsent").checked,
  };
}

function updateLeadPreview() {
  const preview = $("leadEstimatePreview");
  if (preview) preview.textContent = [estimateSummary(), "", "Financial Health Snapshot:", healthSummary()].join("\n");
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
    "Hi, I used your sale and purchase calculator and would like to sense-check my figures.",
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
    "Financial health snapshot:",
    payload.analysisSummary,
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

function syncApprovedLoanWithLoanType() {
  const loanType = $("loanType").value;
  const approvedLoanInput = $("approvedLoan");
  const isHdbPurchase = state.mode === "hdb";

  if (loanType === "No loan") {
    approvedLoanInput.value = money.format(0);
    approvedLoanInput.disabled = true;
    return;
  }

  approvedLoanInput.disabled = false;
  if (cleanNumber(approvedLoanInput.value) === 0) {
    const purchasePrice = num("purchasePrice");
    const valuation = isHdbPurchase ? num("valuation") : purchasePrice;
    const loanValue = Math.min(purchasePrice, valuation || purchasePrice);
    if (loanValue <= 0) {
      approvedLoanInput.value = "";
      return;
    }
    const loanRate = loanType === "HDB loan" ? HDB_LOAN_LTV : BANK_LOAN_LTV;
    approvedLoanInput.value = money.format(loanValue * loanRate);
  }
}

function syncValuationWithPurchasePrice() {
  if (state.mode !== "hdb" || state.valuationEdited) return;
  const purchasePrice = num("purchasePrice");
  $("valuation").value = purchasePrice > 0 ? money.format(purchasePrice) : "";
}

function updateSecondHdbPaydownAutoValue() {
  const field = $("secondHdbPaydown");
  if (!field || state.secondHdbPaydownEdited) return;

  if (state.mode !== "hdb" || $("loanType").value !== "HDB loan") {
    field.value = money.format(0);
    return;
  }

  const seller = getSellerData();
  const keyedLoan = num("approvedLoan");
  const loanValue = Math.min(num("purchasePrice"), num("valuation") || num("purchasePrice"));
  const loan = Math.min(keyedLoan, loanValue * HDB_LOAN_LTV);
  field.value = money.format(Math.min(Math.max(seller.proceeds, 0) * 0.5, loan));
}

function updateBuyerModeCopy() {
  const isHdbPurchase = state.mode === "hdb";
  const hdbLoanOption = Array.from($("loanType").options).find((option) => option.textContent === "HDB loan");
  const absdOptions = Array.from($("absdProfile").options);

  $("buyerPanelTitle").textContent = isHdbPurchase ? "HDB buyer calculator" : "Condo buyer calculator";
  $("buyerPanelDescription").textContent = isHdbPurchase
    ? "Estimate cash needed after HDB or bank loan, CPF OA, grants, stamp duties, and cash-only misc/commission costs."
    : "Estimate cash needed after bank loan, CPF OA, stamp duties, and cash-only misc/commission costs.";
  $("purchasePriceLabel").textContent = isHdbPurchase ? "Next HDB purchase price" : "Private condo purchase price";
  $("valuationLabel").textContent = isHdbPurchase ? "Valuation" : "Bank Valuation";
  $("absdLabel").textContent = isHdbPurchase ? "SPR ABSD option" : "ABSD profile";
  $("grantLabel").textContent = isHdbPurchase ? "CPF housing grants, if any" : "CPF housing grants";
  $("valuation").closest(".field").hidden = !isHdbPurchase;
  $("buyerGrant").closest(".field").hidden = !isHdbPurchase;
  $("loanTypeGuide").hidden = !(isHdbPurchase && $("loanType").value === "HDB loan");
  $("secondHdbPaydownField").hidden = !(isHdbPurchase && $("loanType").value === "HDB loan");
  if (isHdbPurchase && cleanNumber($("buyerLegal").value) === 3000) {
    $("buyerLegal").value = money.format(2500);
  }
  if (!isHdbPurchase && cleanNumber($("buyerLegal").value) === 2500) {
    $("buyerLegal").value = money.format(3000);
  }
  $("buyerLegalGuide").textContent = isHdbPurchase ? "Usually around $1,500 to $2,500." : "Usually around $2,500 to $3,000.";
  $("buyerMiscGuide").textContent = isHdbPurchase
    ? "Usually around $500 to $1,500 for resale application, HDB admin, HDB search, HDB survey, HDB caveat, pro-rated town council, and property tax."
    : "Usually between $500 to $1,000.";

  if (hdbLoanOption) {
    hdbLoanOption.hidden = !isHdbPurchase;
    hdbLoanOption.disabled = !isHdbPurchase;
  }

  if (!isHdbPurchase && $("loanType").value === "HDB loan") {
    $("loanType").value = "Bank loan";
  }

  absdOptions.forEach((option) => {
    const isVisible = option.dataset.scope === (isHdbPurchase ? "hdb" : "condo");
    option.hidden = !isVisible;
    option.disabled = !isVisible;
  });
  const selectedScope = $("absdProfile").selectedOptions[0]?.dataset.scope;
  if (selectedScope !== (isHdbPurchase ? "hdb" : "condo")) {
    const nextOption = absdOptions.find((option) => !option.disabled);
    if (nextOption) nextOption.selected = true;
  }

  syncApprovedLoanWithLoanType();
  syncValuationWithPurchasePrice();
  updateSecondHdbPaydownAutoValue();
}

function updatePanels() {
  updateBuyerModeCopy();
  $("sellerPanel").classList.toggle("active", state.mode === "seller" || state.mode === "hdb" || state.mode === "condo");
  $("buyerPanel").classList.toggle("active", state.mode === "hdb" || state.mode === "condo");
  $("calculator").classList.toggle("combined", state.mode === "hdb" || state.mode === "condo");
}

function calculate() {
  updateCommissionVisibility();
  if (state.mode === "seller") renderSeller();
  else renderBoth();
}

document.querySelectorAll(".mode-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const previousMode = state.mode;
    state.mode = button.dataset.mode;
    if (state.mode === "hdb" && previousMode !== "hdb") {
      $("loanType").value = "HDB loan";
      state.valuationEdited = false;
      state.secondHdbPaydownEdited = false;
    }
    document.querySelectorAll(".mode-btn").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    updatePanels();
    calculate();
  });
});

document.querySelectorAll("input, select").forEach((input) => {
  input.addEventListener("input", () => {
    if (input.classList.contains("money-input")) formatMoneyInput(input);
    if (input.id === "valuation") state.valuationEdited = true;
    if (input.id === "secondHdbPaydown") state.secondHdbPaydownEdited = true;
    if (input.id === "purchasePrice") syncValuationWithPurchasePrice();
    if (["purchasePrice", "sellingPrice", "sellerLoan", "cpfRefund", "approvedLoan", "sellerCommissionOverride", "buyerCommissionOverride"].includes(input.id)) {
      updateSecondHdbPaydownAutoValue();
    }
    calculate();
  });
  input.addEventListener("change", () => {
    if (input.id === "loanType") {
      state.secondHdbPaydownEdited = false;
      updateBuyerModeCopy();
    }
    calculate();
  });
});

$("loanType").addEventListener("change", () => {
  state.secondHdbPaydownEdited = false;
  updateBuyerModeCopy();
  calculate();
});

document.querySelectorAll(".money-input").forEach((input) => {
  input.addEventListener("blur", () => {
    formatMoneyInput(input);
    if (input.id === "purchasePrice") syncValuationWithPurchasePrice();
    if (["purchasePrice", "valuation", "sellingPrice", "sellerLoan", "cpfRefund", "approvedLoan", "sellerCommissionOverride", "buyerCommissionOverride"].includes(input.id)) {
      updateSecondHdbPaydownAutoValue();
    }
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
  if (state.leadSubmitted) return;

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
  state.leadSubmitted = true;
  $("leadSubmitButton").disabled = true;
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
