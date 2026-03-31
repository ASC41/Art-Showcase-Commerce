import { Router, type IRouter, type Request, type Response } from "express";
import { sendInquiry } from "../lib/mailer";

const router: IRouter = Router();

router.post("/api/inquire", async (req: Request, res: Response) => {
  const { type, name, email, message } = req.body ?? {};

  if (!type || !name || !email || !message) {
    return res.status(400).json({ error: "All fields are required." });
  }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) {
    return res.status(400).json({ error: "Invalid email address." });
  }

  try {
    await sendInquiry({ type, name, email, message });
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Failed to send inquiry. Please try again." });
  }
});

export default router;
