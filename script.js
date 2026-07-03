const FORM_ENDPOINT = "https://script.google.com/macros/s/AKfycbzKQK18-FTOyS7u0e-XN4_hEtEbaxemlw6PWOenvCpsCBovOm9799K7kAjbSu8kAtZUtA/exec";
const WHATSAPP_NUMBER = "6583963088";
const GST_RATE = 0.09;

const state = {
  mode: "buying",
};

const form = document.querySelector("#calculator");
const buttons = document.querySelectorAll(".mode-btn");
const panels = document.querySelectorAll(".form-panel");
const resultLabel = document.querySelector("#resultLabel");
const primaryResult = document.querySelector("#primaryResult");
const heroMetric = document.querySelector("#heroMetric");
const heroCaption = document.querySelector("#heroCaption");
const breakdown = document.querySelector("#breakdown");
const modal = document.querySelector("#leadModal");
const statusLine = document.querySelector("#status");
const healthBadge = document.querySelector("#healthBadge");
const readinessText = document.querySelector("#readinessText");
const nextStepText = document.querySelector("#nextStepText");
const modalEstimate = document.querySelector("#modalEstimate");
const submitLeadButton = document.querySelector("#submitLead");
let leadSubmitted = false;

function money(value) {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(value)).toLocaleString("en-SG")}`;
}

function numberFromMoney(value) {
  return Number(String(value).replace(/[^\d.-]/g, "")) || 0;
}

function stampDuty(price) {
  const tiers = [
    [180000, 0.01],
    [180000, 0.02],
    [640000, 0.03],
    [500000, 0.04],
    [1500000, 0.05],
    [Infinity, 0.06],
  ];
  let remaining = price;
  let total = 0;
  for (const [cap, rate] of tiers) {
    const taxable = Math.min(remaining, cap);
    if (taxable <= 0) break;
    total += taxable * rate;
    remaining -= taxable;
  }
  return total;
}

function values() {
  const data = new FormData(form);
  const get = (name) => numberFromMoney(data.get(name));
  const rate = (name) => Number(data.get(name)) || 0;

  const price = get("purchasePrice");
  const cpfAvailable = get("cpf");
  const cashSavings = get("cash");
  const stampBasis = price;
  const maxBankLoan = price * 0.75;
  const approvedLoan = Math.min(get("loan"), maxBankLoan);
  const bsd = stampDuty(stampBasis);
  const absdRate = Number(data.get("absd")) || 0;
  const absd = stampBasis * (absdRate / 100);
  const buyerLegal = get("buyerLegal");
  const buyerMisc = get("buyerMisc");
  const buyerCommissionRate = rate("buyerCommissionRate");
  const buyerCommission = data.get("buyerCommissionOn")
    ? price * (buyerCommissionRate / 100) * (1 + GST_RATE)
    : 0;
  const downpayment = Math.max(price - approvedLoan, 0);
  const cashDownpaymentGuide = price * 0.05;
  const cpfCashDownpaymentGuide = price * 0.2;
  const cpfUsed = Math.min(cpfAvailable, Math.max(downpayment - cashDownpaymentGuide, 0) + bsd + absd);
  const cashNeeded = Math.max(downpayment - cpfUsed, 0) + bsd + absd + buyerLegal + buyerMisc + buyerCommission;
  const cashTopUpAfterCpf = Math.max(cashNeeded - cashSavings, 0);
  const purchaseRequirement = downpayment + bsd + absd + buyerLegal + buyerMisc + buyerCommission;

  const salePrice = get("sellingPrice");
  const outstandingLoan = get("outstandingLoan");
  const cpfRefund = get("cpfRefund");
  const ssd = get("ssd");
  const bankPenalty = get("bankPenalty");
  const sellerLegal = get("sellerLegal");
  const sellerMisc = get("sellerMisc");
  const sellerCommissionRate = rate("sellerCommissionRate");
  const sellerCommission = data.get("sellerCommissionOn")
    ? salePrice * (sellerCommissionRate / 100) * (1 + GST_RATE)
    : 0;
  const saleDeductions = outstandingLoan + cpfRefund + ssd + bankPenalty + sellerLegal + sellerMisc + sellerCommission;
  const saleProceeds = salePrice - saleDeductions;
  const netPosition = saleProceeds - purchaseRequirement;

  return {
    price,
    cpfAvailable,
    cashSavings,
    stampBasis,
    maxBankLoan,
    approvedLoan,
    bsd,
    absdRate,
    absd,
    buyerLegal,
    buyerMisc,
    buyerCommission,
    buyerCommissionRate,
    downpayment,
    cashDownpaymentGuide,
    cpfCashDownpaymentGuide,
    cpfUsed,
    cashNeeded,
    cashTopUpAfterCpf,
    purchaseRequirement,
    salePrice,
    outstandingLoan,
    cpfRefund,
    ssd,
    bankPenalty,
    sellerLegal,
    sellerMisc,
    sellerCommission,
    sellerCommissionRate,
    saleDeductions,
    saleProceeds,
    netPosition,
  };
}

function row(label, value, tone = "") {
  return `<div class="row ${tone}"><span>${label}</span><strong>${money(value)}</strong></div>`;
}

function section(label) {
  return `<div class="row section"><span>${label}</span><strong></strong></div>`;
}

function buyerRows(v) {
  return [
    row("Private condo purchase price", v.price),
    row("Stamp duty basis", v.stampBasis),
    row("Buyer Stamp Duty", v.bsd),
    row(`ABSD at ${v.absdRate}%`, v.absd),
    row("Legal fee", v.buyerLegal),
    row("Miscellaneous fee (cash only)", v.buyerMisc),
    row("Agent commission + GST (cash only)", v.buyerCommission),
    row("Max bank loan at 75% LTV", v.maxBankLoan),
    row("Approved loan", -v.approvedLoan, "positive"),
    row("5% cash downpayment guide", v.cashDownpaymentGuide),
    row("20% CPF and/or cash downpayment guide", v.cpfCashDownpaymentGuide),
    row("CPF OA used", -v.cpfUsed, "positive"),
    row("Cash needed", v.cashNeeded, v.cashNeeded > 0 ? "warning" : "positive"),
    row("Estimated cash top-up needed after CPF OA", v.cashTopUpAfterCpf, v.cashTopUpAfterCpf > 0 ? "warning" : "positive"),
  ];
}

function sellerRows(v) {
  return [
    row("Selling price", v.salePrice),
    row("Outstanding loan", -v.outstandingLoan, "warning"),
    row("CPF refund with accrued interest", -v.cpfRefund, "warning"),
    row("Seller stamp duty, if any", -v.ssd, "warning"),
    row("Bank penalty, if any", -v.bankPenalty, "warning"),
    row("Legal fee", -v.sellerLegal, "warning"),
    row("Miscellaneous fee (cash only)", -v.sellerMisc, "warning"),
    row("Agent commission + GST (cash only)", -v.sellerCommission, "warning"),
    row("Estimated cash proceeds", v.saleProceeds, v.saleProceeds >= 0 ? "positive" : "warning"),
  ];
}

function healthSnapshot(v) {
  let healthy;
  let subject;

  if (state.mode === "selling") {
    healthy = v.saleProceeds > 0;
    subject = "condo sale";
  } else if (state.mode === "both") {
    healthy = v.netPosition >= 0;
    subject = "condo upgrade";
  } else {
    healthy = v.cashTopUpAfterCpf <= Math.max(v.cashNeeded * 0.25, 50000);
    subject = "condo purchase";
  }

  if (healthy) {
    return {
      badge: "Healthy",
      review: false,
      readiness: `Based on the keyed-in figures, this ${subject} appears to have a good starting position.`,
      nextStep: "The figures look workable as a first pass. A review can help refine the realistic condo upgrade budget, timeline, and suitable property options.",
    };
  }

  return {
    badge: "Review first before proceeding",
    review: true,
    readiness: `Based on the keyed-in figures, this ${subject} may need a closer review before proceeding.`,
    nextStep: "A sense-check can help refine the budget, cash buffer, timeline, and suitable property options before the next commitment.",
  };
}

function render() {
  const v = values();
  document.body.classList.toggle("mode-both", state.mode === "both");

  panels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === state.mode || state.mode === "both");
  });

  let label;
  let primary;
  let rows;

  if (state.mode === "selling") {
    label = "Estimated cash proceeds";
    primary = v.saleProceeds;
    rows = sellerRows(v);
  } else if (state.mode === "both") {
    label = "Estimated net position";
    primary = v.netPosition;
    rows = [
      row("Estimated sale proceeds", v.saleProceeds, "positive"),
      row("Estimated purchase requirement", -v.purchaseRequirement, "warning"),
      row("Estimated net position", v.netPosition, v.netPosition >= 0 ? "positive" : "warning"),
      section("Selling summary"),
      ...sellerRows(v),
      section("Buying summary"),
      ...buyerRows(v),
    ];
  } else {
    label = "Estimated buyer cash / CPF required";
    primary = v.purchaseRequirement;
    rows = buyerRows(v);
  }

  resultLabel.textContent = label;
  heroCaption.textContent = label;
  primaryResult.textContent = money(primary);
  heroMetric.textContent = money(primary);
  breakdown.innerHTML = rows.join("");
  renderHealth(v);
  renderModalEstimate(v);
}

function renderHealth(v) {
  const health = healthSnapshot(v);
  healthBadge.textContent = health.badge;
  healthBadge.classList.toggle("review", health.review);
  readinessText.textContent = health.readiness;
  nextStepText.textContent = health.nextStep;
}

function modalRows(v) {
  let rows;
  if (state.mode === "selling") {
    rows = [
      row("Current mode", 0).replace("<strong>$0</strong>", "<strong>Selling condo</strong>"),
      ...sellerRows(v),
    ];
  } else if (state.mode === "both") {
    rows = [
      row("Current mode", 0).replace("<strong>$0</strong>", "<strong>Buying & selling condo</strong>"),
      row("Estimated sale proceeds", v.saleProceeds, "positive"),
      row("Estimated purchase requirement", -v.purchaseRequirement, "warning"),
      row("Estimated net position", v.netPosition, v.netPosition >= 0 ? "positive" : "warning"),
      section("Selling details"),
      ...sellerRows(v),
      section("Buying details"),
      ...buyerRows(v),
    ];
  } else {
    rows = [
      row("Current mode", 0).replace("<strong>$0</strong>", "<strong>Buying condo</strong>"),
      ...buyerRows(v),
    ];
  }

  return rows;
}

function renderModalEstimate(v = values()) {
  modalEstimate.innerHTML = `<div class="modal-summary">${modalRows(v).join("")}</div>`;
}

function setMode(mode) {
  state.mode = mode;
  buttons.forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  render();
}

function normaliseMoneyInput(input) {
  input.value = money(numberFromMoney(input.value));
}

function leadPayload() {
  const v = values();
  return {
    createdAt: new Date().toISOString(),
    mode: state.mode,
    lead: {
      name: document.querySelector("#leadName").value.trim(),
      phone: document.querySelector("#leadPhone").value.trim(),
      preferredTime: document.querySelector("#leadTime").value,
      notes: document.querySelector("#leadNotes").value.trim(),
    },
    summary: {
      resultLabel: resultLabel.textContent,
      primaryResult: primaryResult.textContent,
      estimatedSaleProceeds: money(v.saleProceeds),
      estimatedPurchaseRequirement: money(v.purchaseRequirement),
      estimatedNetPosition: money(v.netPosition),
    },
    itemised: itemisedLines(v),
    values: v,
  };
}

function itemisedLines(v) {
  const lines = [];
  if (state.mode === "selling" || state.mode === "both") {
    lines.push("Selling summary");
    sellerRows(v).forEach((html) => lines.push(textFromRow(html)));
  }
  if (state.mode === "buying" || state.mode === "both") {
    lines.push("Buying summary");
    buyerRows(v).forEach((html) => lines.push(textFromRow(html)));
  }
  return lines;
}

function textFromRow(html) {
  const match = html.match(/<span>(.*?)<\/span><strong>(.*?)<\/strong>/);
  return match ? `${match[1]}: ${match[2]}` : "";
}

function whatsappMessage(payload) {
  return [
    "Hi Angie, I would like to sense check my condo figures.",
    "",
    `Name: ${payload.lead.name || "-"}`,
    `WhatsApp: ${payload.lead.phone || "-"}`,
    `Preferred contact time: ${payload.lead.preferredTime}`,
    `Mode: ${payload.mode}`,
    "",
    "Estimate summary",
    `${payload.summary.resultLabel}: ${payload.summary.primaryResult}`,
    `Estimated sale proceeds: ${payload.summary.estimatedSaleProceeds}`,
    `Estimated purchase requirement: ${payload.summary.estimatedPurchaseRequirement}`,
    `Estimated net position: ${payload.summary.estimatedNetPosition}`,
    "",
    "Details",
    ...payload.itemised,
    "",
    `Notes: ${payload.lead.notes || "-"}`,
  ].join("\n");
}

function clearLeadErrors() {
  statusLine.textContent = "";
  statusLine.classList.remove("error");
  ["leadName", "leadPhone"].forEach((id) => {
    const input = document.querySelector(`#${id}`);
    input.closest(".field").classList.remove("has-error");
    document.querySelector(`#${id}Error`).textContent = "";
  });
}

function showLeadError(input, errorId, message) {
  statusLine.textContent = message;
  statusLine.classList.add("error");
  input.closest(".field").classList.add("has-error");
  document.querySelector(`#${errorId}`).textContent = message;
  input.focus();
}

function isValidSingaporeMobile(value) {
  const phone = String(value).replace(/[\s-]/g, "");
  return /^(?:\+65)?[89]\d{7}$/.test(phone);
}

async function submitLead() {
  if (leadSubmitted) {
    statusLine.textContent = "Your estimate has already been prepared for WhatsApp.";
    statusLine.classList.remove("error");
    return;
  }

  clearLeadErrors();

  const nameInput = document.querySelector("#leadName");
  const phoneInput = document.querySelector("#leadPhone");
  const leadName = nameInput.value.trim();
  const leadPhone = phoneInput.value.trim();

  if (!leadName) {
    showLeadError(nameInput, "leadNameError", "You have yet to key in your name.");
    return;
  }

  if (!leadPhone) {
    showLeadError(phoneInput, "leadPhoneError", "You have yet to key in your WhatsApp number.");
    return;
  }

  if (!isValidSingaporeMobile(leadPhone)) {
    showLeadError(phoneInput, "leadPhoneError", "Please rekey a valid Singapore mobile number.");
    return;
  }

  if (!document.querySelector("#leadConsent").checked) {
    statusLine.textContent = "Please tick the consent box first.";
    return;
  }

  leadSubmitted = true;
  submitLeadButton.disabled = true;
  submitLeadButton.textContent = "Opening WhatsApp...";

  const payload = leadPayload();

  if (FORM_ENDPOINT) {
    try {
      await fetch(FORM_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      leadSubmitted = false;
      submitLeadButton.disabled = false;
      submitLeadButton.textContent = "Sense check and open Whatsapp";
      statusLine.textContent = "Unable to record the details. Please try again.";
      return;
    }
  } else {
    localStorage.setItem("condoCalculatorLastLead", JSON.stringify(payload));
  }

  statusLine.textContent = "Opening WhatsApp with your estimate summary.";
  statusLine.classList.remove("error");
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage(payload))}`, "_blank");
}

buttons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
form.addEventListener("input", render);
document.querySelectorAll(".money-input").forEach((input) => {
  input.addEventListener("blur", () => normaliseMoneyInput(input));
});
document.querySelector("#openLead").addEventListener("click", () => {
  renderModalEstimate();
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
});
document.querySelector("#closeLead").addEventListener("click", () => {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
});
document.querySelector("#leadName").addEventListener("input", clearLeadErrors);
document.querySelector("#leadPhone").addEventListener("input", clearLeadErrors);
submitLeadButton.addEventListener("click", submitLead);

render();
