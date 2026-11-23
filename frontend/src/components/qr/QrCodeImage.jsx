import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QrCodeImage({
    value,
    size = 260,
    errorCorrectionLevel = 'M',
    alt = 'QR Code',
    className = '',
}) {
    const [dataUrl, setDataUrl] = useState('');

    useEffect(() => {
        let cancelled = false;
        if (!value) {
            setDataUrl('');
            return undefined;
        }
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        QRCode.toDataURL(text, {
            errorCorrectionLevel,
            margin: 3,
            width: size,
            color: {
                dark: '#1C1917',
                light: '#FFFFFF',
            },
        })
            .then((url) => {
                if (!cancelled) setDataUrl(url);
            })
            .catch(() => {
                if (!cancelled) setDataUrl('');
            });

        return () => {
            cancelled = true;
        };
    }, [value, size, errorCorrectionLevel]);

    if (!dataUrl) {
        return (
            <div
                className={`rounded-xl bg-stone-100 animate-pulse ${className}`}
                style={{ width: size, height: size }}
            />
        );
    }

    return <img src={dataUrl} alt={alt} className={`rounded-xl select-none ${className}`} />;
}
