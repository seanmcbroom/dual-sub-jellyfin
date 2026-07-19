/**
 * Parses raw HTML string from ichi.moe into a structured JSON dictionary format.
 * Translated from the cheerio-based Node CLI parser to use native DOMParser.
 */
function parseIchiHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const result = {
    query: "",
    segments: []
  };

  const segmentSpans = doc.querySelectorAll('h2.query-text-full span.query-text');
  
  segmentSpans.forEach(el => {
    const partId = el.getAttribute('data-part');
    const text = el.textContent.trim();

    result.query += text;

    const segment = {
      part_id: partId,
      text: text,
      words: []
    };

    // Extract the exact start/end character indices for this specific segment
    const wordMappings = {};
    const dsWords = doc.querySelectorAll(`span.ds-text[data-part="${partId}"][data-pick="0"] span.ds-word`);
    
    dsWords.forEach(dsEl => {
      const wId = dsEl.getAttribute('data-word');
      const start = parseInt(dsEl.getAttribute('data-start'), 10);
      const end = parseInt(dsEl.getAttribute('data-end'), 10);
      wordMappings[wId] = { start, end };
    });

    const glossRow = doc.querySelector(`.gloss-row[data-part="${partId}"][data-pick="0"]`);
    
    if (glossRow) {
      const glosses = glossRow.querySelectorAll('.gloss');
      
      glosses.forEach(glossEl => {
        const wordId = glossEl.getAttribute('data-word');
        
        const romajiEl = glossEl.querySelector('.gloss-rtext em');
        const romaji = romajiEl ? romajiEl.textContent.trim() : "";
        
        const kanjiKanaEl = glossEl.querySelector('.gloss-content dl.alternatives dt');
        const kanjiKana = kanjiKanaEl ? kanjiKanaEl.textContent.trim() : "";

        const partsOfSpeech = [];
        const meanings = [];
        const notes = [];

        const definitions = glossEl.querySelectorAll('.gloss-definitions li');
        
        definitions.forEach(defEl => {
          const posEl = defEl.querySelector('.pos-desc');
          const pos = posEl ? posEl.textContent.trim() : "";
          
          const meaningEl = defEl.querySelector('.gloss-desc');
          const meaning = meaningEl ? meaningEl.textContent.trim() : "";
          
          const noteEl = defEl.querySelector('.sense-info-note');
          const note = noteEl ? noteEl.getAttribute('title') : "";

          if (pos) partsOfSpeech.push(pos);
          if (meaning) meanings.push(meaning);
          if (note) notes.push(note.trim());
        });

        // Slice the exact original characters using the mapping indices
        const mapping = wordMappings[wordId];
        let matchedText = "";
        if (mapping && !isNaN(mapping.start) && !isNaN(mapping.end)) {
          matchedText = text.substring(mapping.start, mapping.end);
        }

        if (romaji || kanjiKana || matchedText) {
          segment.words.push({
            id: wordId,
            matched_text: matchedText,
            start_index: mapping ? mapping.start : null,
            end_index: mapping ? mapping.end : null,
            romaji: romaji,
            kanji_kana: kanjiKana,
            part_of_speech: [...new Set(partsOfSpeech)],
            meanings: meanings,
            notes: [...new Set(notes)]
          });
        }
      });
    }

    result.segments.push(segment);
  });

  return result;
}

module.exports = { parseIchiHtml };
