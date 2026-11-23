/**
 * Shared modern YouTube/Netflix-style subtitle cue generator & WebVTT track builder.
 * Splits multi-speaker dialogues and long sentences into crisp 1-2 line timed cues
 * that stay synced with scene start/end timestamps (including teacher edits in CMS).
 */

export function splitDialogue(dialogue) {
    return String(dialogue || '')
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const m = part.match(/^([^:"“]{1,24}):\s*(.*)$/s);
            const who = m ? m[1].trim() : '';
            const text = (m ? m[2] : part).trim().replace(/^["“]|["”]$/g, '');
            return { who, text };
        })
        .filter((item) => item.text.length > 0);
}

/** Split a long single-speaker text (> maxChars) into clean 1-2 line chunks at natural breaks. */
function chunkCaptionText(text, maxChars = 84) {
    const clean = String(text || '').trim();
    if (clean.length <= maxChars) return [clean];

    // Prefer splitting at sentence boundaries first (. ! ?)
    const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [clean];
    const chunks = [];
    let buf = '';

    const pushOrSplitWords = (segment) => {
        if (segment.length <= maxChars) {
            chunks.push(segment);
            return;
        }
        // Split at comma near midpoint if available, else balanced word midpoint
        const mid = Math.floor(segment.length / 2);
        const words = segment.split(/\s+/);
        let left = '';
        let right = '';
        let inRight = false;
        for (const w of words) {
            if (!inRight && (!left || (left.length + w.length + 1 <= mid + 8 && left.length + w.length + 1 <= maxChars))) {
                left = left ? `${left} ${w}` : w;
            } else {
                inRight = true;
                right = right ? `${right} ${w}` : w;
            }
        }
        if (left) chunks.push(left);
        if (right) {
            if (right.length > maxChars) {
                pushOrSplitWords(right);
            } else {
                chunks.push(right);
            }
        }
    };

    for (const s of sentences) {
        if (!buf) {
            if (s.length > maxChars) {
                pushOrSplitWords(s);
            } else {
                buf = s;
            }
        } else if (buf.length + 1 + s.length <= maxChars) {
            buf = `${buf} ${s}`;
        } else {
            chunks.push(buf);
            buf = '';
            if (s.length > maxChars) {
                pushOrSplitWords(s);
            } else {
                buf = s;
            }
        }
    }
    if (buf) chunks.push(buf);
    return chunks;
}

/**
 * Build proportionally timed 1-2 line subtitle cues from normalized timed scenes (`_start`, `_end`, `_lines`).
 */
export function buildTimedCues(timedScenes) {
    const cues = [];

    (timedScenes || []).forEach((scene, sceneIdx) => {
        const sceneStart = Number(scene._start || 0);
        const sceneEnd = Math.max(sceneStart + 1, Number(scene._end || sceneStart + 15));
        const lines = scene._lines || splitDialogue(scene.dialogue);
        if (!lines.length) return;

        // Expand each speaker line into short 1-2 line visual caption chunks
        const expanded = [];
        lines.forEach((line) => {
            const isNarrator = !line.who || /narrator|tagapagsalaysay/i.test(line.who);
            const speaker = isNarrator ? '' : line.who;
            const parts = chunkCaptionText(line.text, 84);
            parts.forEach((part) => {
                expanded.push({
                    who: speaker,
                    text: part,
                    weight: Math.max(12, part.length),
                });
            });
        });

        const totalWeight = expanded.reduce((acc, item) => acc + item.weight, 0) || 1;
        // Slight 0.35s lead-in and 0.25s tail margin so captions match spoken audio beats cleanly
        const usableStart = sceneStart + Math.min(0.35, (sceneEnd - sceneStart) * 0.08);
        const usableEnd = Math.max(usableStart + 0.8, sceneEnd - 0.25);
        const span = usableEnd - usableStart;

        let cursor = usableStart;
        expanded.forEach((item, i) => {
            const dur = (item.weight / totalWeight) * span;
            const start = cursor;
            const end = i === expanded.length - 1 ? usableEnd : cursor + dur;
            cues.push({
                id: `${sceneIdx}-${i}`,
                sceneIdx,
                start: Math.round(start * 100) / 100,
                end: Math.round(end * 100) / 100,
                who: item.who,
                text: item.text,
            });
            cursor = end;
        });
    });

    return cues;
}

function formatVttTime(sec) {
    const safe = Math.max(0, Number(sec) || 0);
    const hrs = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const secs = Math.floor(safe % 60);
    const ms = Math.round((safe - Math.floor(safe)) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/** Generate a WEBVTT string for native browser Fullscreen <track> playback. */
export function buildWebVttText(cues) {
    const lines = ['WEBVTT', ''];
    (cues || []).forEach((cue, i) => {
        lines.push(String(i + 1));
        lines.push(`${formatVttTime(cue.start)} --> ${formatVttTime(cue.end)}`);
        lines.push(cue.who ? `${cue.who}: “${cue.text}”` : cue.text);
        lines.push('');
    });
    return lines.join('\n');
}
