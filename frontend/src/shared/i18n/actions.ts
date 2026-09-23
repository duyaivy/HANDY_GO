"use server";

import { cookies } from "next/headers";

export async function setLocaleAction(locale: "vi" | "en") {
    const cookieStore = await cookies();
    cookieStore.set("app-locale", locale, { path: "/" });
}
