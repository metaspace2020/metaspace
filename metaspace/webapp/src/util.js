function prettifySign(str) {
    return str.replace('-', ' – ').replace('+', ' + ');
}

function renderSumFormula(sumFormula, adduct, polarity) {
  let result = `[${(sumFormula + adduct).replace(/(\d+)/g, "<sub>$1</sub>")}]`;
  result = prettifySign(result);
  result += {'POSITIVE': '⁺', 'NEGATIVE': '¯'}[polarity];
  return result;
}

export { renderSumFormula, prettifySign };
