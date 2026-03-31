import nodemailer from "nodemailer";

const GMAIL_USER = "ryancellart@gmail.com";
const GMAIL_PASSWORD = process.env.GMAIL_APP_PASSWORD;

function createTransport() {
  if (!GMAIL_PASSWORD) {
    console.warn("GMAIL_APP_PASSWORD not set — email notifications disabled");
    return null;
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PASSWORD,
    },
  });
}

export async function sendInquiry(opts: {
  type: string;
  name: string;
  email: string;
  message: string;
}) {
  const transporter = createTransport();
  const { type, name, email, message } = opts;

  const subject = `New Inquiry — ${type} — ${name}`;
  const text = [
    `Inquiry type: ${type}`,
    ``,
    `From: ${name}`,
    `Email: ${email}`,
    ``,
    `Message:`,
    message,
  ].join("\n");

  if (!transporter) {
    console.log(`[inquiry — email disabled]\n${subject}\n${text}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: `"Ryan Cellar Studio" <${GMAIL_USER}>`,
      to: GMAIL_USER,
      replyTo: email,
      subject,
      text,
    });
    console.log(`Inquiry email sent from ${email}`);
  } catch (err) {
    console.error("Failed to send inquiry email:", err);
    throw err;
  }
}

export async function sendOrderNotification(opts: {
  artworkTitle: string;
  purchaseType: "original" | "print";
  customerEmail: string | null;
  stripeSessionId: string;
}) {
  const transporter = createTransport();
  if (!transporter) return;

  const { artworkTitle, purchaseType, customerEmail, stripeSessionId } = opts;
  const typeLabel = purchaseType === "original" ? "Original" : "Print";

  const subject = `New ${typeLabel} Sale — ${artworkTitle}`;
  const text = [
    `You sold a ${typeLabel.toLowerCase()} of "${artworkTitle}"!`,
    ``,
    `Customer email: ${customerEmail ?? "(not provided)"}`,
    `Stripe session: ${stripeSessionId}`,
    purchaseType === "original"
      ? `\nNext step: Contact the buyer to arrange shipping of the original artwork.`
      : `\nNext step: The print order will be fulfilled automatically via Printify.`,
  ].join("\n");

  try {
    await transporter.sendMail({
      from: `"Ryan Cellar Studio" <${GMAIL_USER}>`,
      to: GMAIL_USER,
      subject,
      text,
    });
    console.log(`Sale notification email sent for: ${artworkTitle}`);
  } catch (err) {
    console.error("Failed to send sale notification:", err);
  }
}
