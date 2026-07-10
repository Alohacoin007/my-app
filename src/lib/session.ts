import { cookies } from "next/headers";
import { getIronSession, SessionOptions } from "iron-session";

export type SessionData = {
  userId?: string;
};

const password =
  process.env.SESSION_PASSWORD ??
  "dev-only-please-change-this-to-a-32-char-or-longer-string";

export const sessionOptions: SessionOptions = {
  cookieName: "ab_session",
  password,
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
};

export async function getSession() {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}
