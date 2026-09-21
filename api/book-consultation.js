const crypto = require("crypto");
const { getFrom, getResend } = require("../lib/mail");

/** Day of week: 0=Sun … 6=Sat. Times in America/New_York (24h HH:MM). */
const AVAILABILITY = {
  1: { start: "09:00", end: "18:00" }, // Monday all day
  5: { start: "15:30", end: "20:00" }, // Friday from 15:30
  6: { start: "15:30", end: "20:00" }, // Saturday from 15:30
  0: { start: "09:00", end: "18:00" }, // Sunday all day
};

const SLOT_MINUTES = 30;
const TIMEZONE = "America/New_York";

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") {
      resolve(req.body);
      return;
    }
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 100 * 1024) reject(new Error("Payload too large."));
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function clean(value) {
  return String(value || "").trim();
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function parseHM(hm) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function formatHM(mins) {
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

/** List slots for a YYYY-MM-DD date in local NY calendar. */
function slotsForDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return [];
  const wdName = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
  }).format(new Date(`${dateStr}T12:00:00`));
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = map[wdName];
  const win = AVAILABILITY[day];
  if (!win) return [];

  const start = parseHM(win.start);
  const end = parseHM(win.end);
  const slots = [];
  for (let t = start; t + SLOT_MINUTES <= end; t += SLOT_MINUTES) {
    slots.push(formatHM(t));
  }
  return slots;
}

/** Convert NY local date+time to Date object (UTC instant). */
function nyLocalToDate(dateStr, timeStr) {
  // Approximate with temporal offset via formatter
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  // Start from a guess UTC and refine using NY offset
  let guess = Date.UTC(y, mo - 1, d, hh, mm, 0);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(guess));
    const get = (t) => parts.find((p) => p.type === t).value;
    const nyY = Number(get("year"));
    const nyM = Number(get("month"));
    const nyD = Number(get("day"));
    let nyH = Number(get("hour"));
    if (nyH === 24) nyH = 0;
    const nyMin = Number(get("minute"));
    const desired = Date.UTC(y, mo - 1, d, hh, mm);
    const actual = Date.UTC(nyY, nyM - 1, nyD, nyH, nyMin);
    guess += desired - actual;
  }
  return new Date(guess);
}

function icsStamp(date) {
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

function buildIcs({
  uid,
  start,
  end,
  summary,
  description,
  organizerEmail,
  attendeeEmail,
  attendeeName,
  meetLink,
}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JOSEBIS GLOBAL VENTURES LLC//Consultation//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description.replace(/\n/g, "\\n")}`,
    `ORGANIZER;CN=JOSEBIS GLOBAL VENTURES LLC:mailto:${organizerEmail}`,
    `ATTENDEE;CN=${attendeeName};RSVP=TRUE:mailto:${attendeeEmail}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
  ];
  if (meetLink) {
    lines.push(`LOCATION:${meetLink}`);
    lines.push(`URL:${meetLink}`);
    lines.push(`X-GOOGLE-CONFERENCE:${meetLink}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

function isValidSlot(dateStr, timeStr) {
  return slotsForDate(dateStr).includes(timeStr);
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const date = clean(url.searchParams.get("date"));
    if (!date) {
      res.statusCode = 200;
      return res.end(
        JSON.stringify({
          ok: true,
          timezone: TIMEZONE,
          availability: AVAILABILITY,
          slotMinutes: SLOT_MINUTES,
        })
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, message: "Invalid date." }));
    }
    const slots = slotsForDate(date).filter((t) => {
      const start = nyLocalToDate(date, t);
      return start.getTime() > Date.now() + 60 * 60 * 1000; // at least 1h ahead
    });
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, date, timezone: TIMEZONE, slots }));
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, message: "Method not allowed." }));
  }

  try {
    const body = await readJson(req);
    const name = clean(body.name);
    const email = clean(body.email);
    const phone = clean(body.phone);
    const date = clean(body.date);
    const time = clean(body.time);
    const notes = clean(body.notes);

    if (!name || !email || !phone || !date || !time) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, message: "Please fill in all required fields." }));
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, message: "Please provide a valid email address." }));
    }
    if (!isValidSlot(date, time)) {
      res.statusCode = 400;
      return res.end(
        JSON.stringify({
          ok: false,
          message: "Selected time is not available. Please choose another slot.",
        })
      );
    }

    const start = nyLocalToDate(date, time);
    if (start.getTime() <= Date.now()) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok: false, message: "Please choose a future time slot." }));
    }
    const end = new Date(start.getTime() + SLOT_MINUTES * 60 * 1000);

    const to = process.env.RECIPIENT_EMAIL || "fjosebis@gmail.com";
    const from = getFrom();
    let resend;
    try {
      resend = getResend();
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok: false, message: err.message || "RESEND_API_KEY missing." }));
    }

    const whenLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(start);

    const meetLink = clean(process.env.CONSULTATION_MEET_LINK);
    const uid = `${crypto.randomBytes(12).toString("hex")}@josebisglobalventures.com`;
    const descParts = [
      "Free consultation call (Elite USA Program)",
      `Client: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      `Notes: ${notes || "n/a"}`,
    ];
    if (meetLink) descParts.push(`Google Meet: ${meetLink}`);

    const ics = buildIcs({
      uid,
      start,
      end,
      summary: `Elite USA — Free consultation with ${name}`,
      description: descParts.join("\\n"),
      organizerEmail: to,
      attendeeEmail: email,
      attendeeName: name,
      meetLink: meetLink || null,
    });

    const meetBlock = meetLink
      ? `\nGoogle Meet:\n${meetLink}\n`
      : "\nGoogle Meet link: will be confirmed by the host.\n";

    const textAdmin = `New Elite USA consultation booking
=================================

When: ${whenLabel}
Duration: ${SLOT_MINUTES} minutes
Timezone: ${TIMEZONE}
${meetBlock}
CLIENT
------
Name: ${name}
Email: ${email}
Phone / WhatsApp: ${phone}

NOTES
-----
${notes || "(none)"}

A calendar invite (.ics) is attached — open it to add this to your agenda${meetLink ? " (includes Google Meet)" : ""}.

JOSEBIS GLOBAL VENTURES LLC
`;

    const textClient = `Your free consultation call is booked
=====================================

Thank you, ${name}.

When: ${whenLabel}
Duration: ${SLOT_MINUTES} minutes
${meetBlock}
Join with Google Meet at the scheduled time${meetLink ? `:\n${meetLink}` : "."}

A calendar invite is attached so you can add this to your agenda.

JOSEBIS GLOBAL VENTURES LLC
https://www.josebisglobalventures.com/
+1 (315) 872-5610
`;

    const icsAttachment = {
      filename: "elite-consultation.ics",
      content: Buffer.from(ics, "utf8"),
      contentType: "text/calendar; method=REQUEST",
    };

    const adminSend = await resend.emails.send({
      from,
      to: [to],
      replyTo: email,
      subject: `Consultation booked: ${name} — ${whenLabel}`,
      text: textAdmin,
      attachments: [icsAttachment],
    });
    if (adminSend.error) {
      console.error("book admin email", adminSend.error);
      res.statusCode = 500;
      return res.end(
        JSON.stringify({
          ok: false,
          message: adminSend.error.message || "Could not send booking email.",
        })
      );
    }

    // Best-effort client confirmation (Resend may block if unverified domain)
    try {
      await resend.emails.send({
        from,
        to: [email],
        subject: `Confirmed: Elite USA free consultation — ${whenLabel}`,
        text: textClient,
        attachments: [icsAttachment],
      });
    } catch (e) {
      console.error("book client email skipped", e);
    }

    res.statusCode = 200;
    return res.end(
      JSON.stringify({
        ok: true,
        message: `Thank you, ${name}. Your consultation is booked for ${whenLabel}. Check your email for the calendar invite${meetLink ? " and Google Meet link" : ""}.`,
        when: whenLabel,
        meet_link: meetLink || null,
      })
    );
  } catch (err) {
    console.error("book-consultation error", err);
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, message: err.message || "Booking failed." }));
  }
};

module.exports.slotsForDate = slotsForDate;
module.exports.AVAILABILITY = AVAILABILITY;
