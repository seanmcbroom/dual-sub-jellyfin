/**
 * Manages the floating tooltip for Japanese dictionary definitions.
 */

let tooltipEl = null;

function createTooltip() {
  if (tooltipEl) return tooltipEl;
  
  tooltipEl = document.createElement("div");
  tooltipEl.id = "jf-ichi-tooltip";
  tooltipEl.className = "jf-hidden";
  
  // Appended to the body to avoid overflow issues inside video player
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function showTooltip(wordData, targetRect) {
  const el = createTooltip();
  
  // Build content
  let html = `<div class="jf-ichi-header">`;
  if (wordData.kanji_kana) {
    html += `<span class="jf-ichi-kanji">${wordData.kanji_kana}</span>`;
  }
  if (wordData.romaji) {
    html += `<span class="jf-ichi-romaji">${wordData.romaji}</span>`;
  }
  html += `</div>`;
  
  if (wordData.part_of_speech && wordData.part_of_speech.length > 0) {
    html += `<div class="jf-ichi-pos">${wordData.part_of_speech.join(", ")}</div>`;
  }
  
  if (wordData.meanings && wordData.meanings.length > 0) {
    html += `<ol class="jf-ichi-meanings">`;
    wordData.meanings.forEach(m => {
      html += `<li>${m}</li>`;
    });
    html += `</ol>`;
  }
  
  if (wordData.notes && wordData.notes.length > 0) {
    html += `<div class="jf-ichi-notes">`;
    wordData.notes.forEach(n => {
      html += `<div>* ${n}</div>`;
    });
    html += `</div>`;
  }
  
  el.innerHTML = html;
  el.classList.remove("jf-hidden");
  
  // Position above the hovered word
  const tooltipRect = el.getBoundingClientRect();
  const margin = 10;
  
  let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
  left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
  
  let top = targetRect.top - tooltipRect.height - margin;
  if (top < margin) {
    // If not enough space above, position below
    top = targetRect.bottom + margin;
  }
  
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.classList.add("jf-hidden");
  }
}

module.exports = { showTooltip, hideTooltip };
