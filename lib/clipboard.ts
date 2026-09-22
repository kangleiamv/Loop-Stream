/**
 * LOOP STREAM by CMAISNAM
 * Cross-browser Universal Clipboard Copy Utility
 * 
 * Works reliably across:
 * - HTTPS secure contexts (navigator.clipboard)
 * - HTTP non-secure contexts (e.g. raw IP http://103.x.x.x:3000 via document.execCommand fallback)
 * - Mobile / desktop browsers (iOS Safari, Android Chrome, desktop browsers)
 */

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!text) return false;

  // 1. Try modern navigator.clipboard API if supported and in secure context
  if (navigator?.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('[Clipboard] navigator.clipboard.writeText failed, trying execCommand fallback:', err);
    }
  }

  // 2. Robust fallback using hidden offscreen textarea and document.execCommand('copy')
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;

    // Prevent scrolling to bottom of page in some browsers
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.opacity = '0';
    textArea.style.zIndex = '-99999';
    textArea.setAttribute('readonly', '');

    document.body.appendChild(textArea);

    textArea.focus({ preventScroll: true });
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);

    if (successful) {
      return true;
    }
  } catch (err) {
    console.error('[Clipboard] document.execCommand copy error:', err);
  }

  // 3. Last-ditch attempt: try navigator.clipboard regardless of isSecureContext flag
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }

  return false;
}
