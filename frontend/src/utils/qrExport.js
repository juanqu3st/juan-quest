import QRCode from 'qrcode';

/**
 * Generates and downloads a high-contrast, ultra-scannable 720x900 PNG Result QR card
 * (zero score spoilers!) so offline students always have a backup copy in Gallery / Messenger.
 */
export async function buildDownloadableQrPng(payload, { userName, groupName, className }) {
    const width = 720;
    const height = 900;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#C2410C';
    ctx.fillRect(0, 0, width, 16);

    ctx.fillStyle = '#1C1917';
    ctx.font = '800 32px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('JUANQUEST · RESULT QR', width / 2, 76);

    const displayTitle =
        groupName && userName && groupName.trim().toLowerCase() !== userName.trim().toLowerCase()
            ? `${groupName} (${userName})`
            : groupName || userName;
    ctx.fillStyle = '#C2410C';
    ctx.font = '700 24px system-ui, -apple-system, sans-serif';
    ctx.fillText(String(displayTitle || '').slice(0, 42), width / 2, 118);

    ctx.fillStyle = '#57534E';
    ctx.font = '600 18px system-ui, -apple-system, sans-serif';
    ctx.fillText(`Klase: ${className || payload.c}  ·  PIN: ${payload.c}`, width / 2, 152);

    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, JSON.stringify(payload), {
        errorCorrectionLevel: 'L',
        margin: 4,
        width: 560,
        color: {
            dark: '#000000',
            light: '#FFFFFF',
        },
    });

    const qrX = Math.round((width - qrCanvas.width) / 2);
    const qrY = 188;

    ctx.strokeStyle = '#1C1917';
    ctx.lineWidth = 4;
    ctx.strokeRect(qrX - 10, qrY - 10, qrCanvas.width + 20, qrCanvas.height + 20);
    ctx.drawImage(qrCanvas, qrX, qrY);

    ctx.fillStyle = '#15803D';
    ctx.font = '700 20px system-ui, -apple-system, sans-serif';
    ctx.fillText(
        payload.sig === 'manual' ? 'Offline Result QR (Manual)' : 'Verified Offline Result QR',
        width / 2,
        804
    );

    ctx.fillStyle = '#57534E';
    ctx.font = '500 17px system-ui, -apple-system, sans-serif';
    ctx.fillText('Ipakita o i-send sa iyong guro upang i-scan sa Live Monitor', width / 2, 842);

    return canvas.toDataURL('image/png');
}

export async function downloadResultQrImage(payload, { userName, groupName, className }) {
    const pngUrl = await buildDownloadableQrPng(payload, { userName, groupName, className });
    const rawSlug = (groupName || userName || 'player')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = `JuanQuest-QR-${rawSlug || 'result'}-${payload.c}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
