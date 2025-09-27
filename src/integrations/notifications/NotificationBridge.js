import nodemailer from "nodemailer";
import { fetch } from "undici";
const DEFAULT_SMS_GATEWAY = "tmomail.net";
let cachedTransport = {
    key: "",
    transporter: null,
};
const sanitize = (value) => value?.trim() || "";
const normalizePhoneNumber = (raw) => {
    if (!raw) {
        return undefined;
    }
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) {
        return digits.substring(1);
    }
    if (digits.length === 10) {
        return digits;
    }
    return digits.length > 0 ? digits : undefined;
};
const formatSmsAddress = (number, gateway) => {
    const normalizedNumber = normalizePhoneNumber(number);
    const sanitizedGateway = sanitize(gateway) || DEFAULT_SMS_GATEWAY;
    if (!normalizedNumber || !sanitizedGateway) {
        return undefined;
    }
    return `${normalizedNumber}@${sanitizedGateway}`;
};
const getTransport = (email, password) => {
    const cacheKey = `${email}:${password}`;
    if (cachedTransport.transporter && cachedTransport.key === cacheKey) {
        return cachedTransport.transporter;
    }
    cachedTransport = {
        key: cacheKey,
        transporter: nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 587,
            secure: false,
            auth: {
                user: email,
                pass: password,
            },
        }),
    };
    return cachedTransport.transporter;
};
const truncateForSms = (text, maxLength = 140) => {
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength - 1)}…`;
};
const sendTelegramMessage = async (botToken, chatId, text) => {
    const endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`Telegram API responded with ${response.status} ${errorText}`);
    }
};
export async function dispatchFollowupNotification(config, payload) {
    const email = sanitize(config.email);
    const emailPassword = sanitize(config.emailPassword);
    const smsNumber = sanitize(config.smsNumber);
    const smsGateway = sanitize(config.smsGateway);
    const telegramBotToken = sanitize(config.telegramBotToken);
    const telegramChatId = sanitize(config.telegramChatId);
    const result = {
        emailSent: false,
        smsSent: false,
        telegramSent: false,
        errors: [],
    };
    let transporter = null;
    const hasEmailTransport = Boolean(email && emailPassword);
    if (hasEmailTransport) {
        try {
            transporter = getTransport(email, emailPassword);
        }
        catch (error) {
            result.errors.push(`Failed to initialize mail transport: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    const { personaName, companyName, question, suggestions } = payload;
    const subject = `AI employee ${personaName} needs your input`;
    const suggestionLines = suggestions.length > 0 ? ["", "Suggested replies:", ...suggestions.map((entry) => `- ${entry}`)] : [];
    const bodyLines = [
        `AI employee ${personaName} needs your input.`,
        companyName ? `Company: ${companyName}` : undefined,
        `Question: ${question}`,
        ...suggestionLines,
        "",
        "Reply inside Golden Workplace to unblock them.",
    ]
        .filter((line) => Boolean(line))
        .join("\n");
    if (transporter && email) {
        try {
            await transporter.sendMail({
                from: email,
                to: email,
                subject,
                text: bodyLines,
            });
            result.emailSent = true;
        }
        catch (error) {
            result.errors.push(`Email delivery failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    else if (email || emailPassword) {
        result.errors.push("Email notifications skipped due to missing or invalid Gmail credentials.");
    }
    const smsAddress = formatSmsAddress(smsNumber, smsGateway);
    if (smsAddress) {
        const smsText = truncateForSms(`AI employee ${personaName} needs input: ${question}`);
        if (!transporter || !email) {
            result.errors.push("SMS delivery skipped because Gmail credentials are missing.");
        }
        else {
            try {
                await transporter.sendMail({
                    from: email,
                    to: smsAddress,
                    subject: "",
                    text: smsText,
                });
                result.smsSent = true;
            }
            catch (error) {
                result.errors.push(`SMS delivery failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    if (telegramBotToken && telegramChatId) {
        try {
            const telegramText = [
                `AI employee ${personaName} needs your input.`,
                companyName ? `Company: ${companyName}` : undefined,
                `Question: ${question}`,
            ]
                .filter(Boolean)
                .join("\n");
            await sendTelegramMessage(telegramBotToken, telegramChatId, telegramText);
            result.telegramSent = true;
        }
        catch (error) {
            result.errors.push(`Telegram delivery failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return result;
}
//# sourceMappingURL=NotificationBridge.js.map