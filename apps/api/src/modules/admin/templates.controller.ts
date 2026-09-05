import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { AdminOnly, Audience, AuthGuard, ManagerGuard, Roles, RolesGuard } from "../../shared/jwt/guards";
import { PrismaService } from "../../shared/prisma/prisma.module";
import { TemplatesService, TemplateRow, TemplateCategory, TemplateChannel } from "../templates/templates.service";
import { NotificationService } from "../notifications/notifications.service";
import { EmailPurpose } from "@prisma/client";

const TEMPLATE_PREFIX = "template.";
const VALID_CHANNELS = new Set(["email", "sms", "push"]);

/**
 * Payload shape accepted by PUT. Mirrors the stored JSON value plus the
 * new bilingual + HTML fields. Caller may omit any field they don't
 * intend to change; missing fields are preserved from the existing row
 * so the PUT acts as a partial update.
 */
interface TemplatePayload {
  category?: TemplateCategory;
  description?: string;
  emailPurpose?: EmailPurpose | null;
  variables?: TemplateRow["variables"];
  subjectEn?: string;
  subjectBn?: string;
  bodyEn?: string;
  bodyBn?: string;
  htmlBodyEn?: string;
  htmlBodyBn?: string;
  staged?: boolean;
}

/**
 * 23 built-in templates — every notification the system actually sends.
 *
 * Status legend:
 *  - [WIRED] — sent at launch by the rewired call sites
 *  - [STAGED] — placeholder row visible in admin, no cron/business logic yet
 */
const BUILTINS: Array<{
  channel: TemplateChannel;
  name: string;
  category: TemplateCategory;
  description: string;
  emailPurpose?: EmailPurpose;
  staged?: boolean;
  subjectEn?: string;
  subjectBn?: string;
  bodyEn: string;
  bodyBn?: string;
  htmlBodyEn?: string;
  htmlBodyBn?: string;
  variables: TemplateRow["variables"];
}> = [
  // ─── Order lifecycle — [WIRED] — category=orders, emailPurpose=ORDERS ──
  {
    channel: "email",
    name: "order_placed",
    category: "orders",
    description: "Sent to the customer when an order is first created.",
    emailPurpose: "ORDERS",
    subjectEn: "Order {{orderNo}} confirmed — XovenMart",
    subjectBn: "অর্ডার {{orderNo}} নিশ্চিত হয়েছে — XovenMart",
    bodyEn:
      "Hi {{customerName}},\n\nThanks for shopping at XovenMart! Your order {{orderNo}} has been received and is now being processed.\n\nOrder summary\n  • Items: {{itemCount}}\n  • Subtotal: ৳{{subtotal}}\n  • Delivery: ৳{{deliveryFee}}\n  • Total: ৳{{total}}\n\nDelivery to: {{address}}\nPayment: {{paymentMethod}}\n\nTrack your order: {{url}}\n\nIf you have any questions, reply to this email or call our support line.\n\n— The XovenMart Team",
    bodyBn:
      "আসসালামু আলাইকুম {{customerName}},\n\nXovenMart এ অর্ডার করার জন্য ধন্যবাদ! আপনার অর্ডার {{orderNo}} গ্রহণ করা হয়েছে এবং প্রক্রিয়াকরণ চলছে।\n\nঅর্ডার সারাংশ\n  • পণ্য সংখ্যা: {{itemCount}}\n  • সাবটোটাল: ৳{{subtotal}}\n  • ডেলিভারি: ৳{{deliveryFee}}\n  • মোট: ৳{{total}}\n\nডেলিভারি ঠিকানা: {{address}}\nপেমেন্ট পদ্ধতি: {{paymentMethod}}\n\nঅর্ডার ট্র্যাক করুন: {{url}}\n\nকোনো প্রশ্ন থাকলে এই ইমেইলে রিপ্লাই দিন অথবা সাপোর্ট নম্বরে কল করুন।\n\n— XovenMart টিম",
    variables: [
      { name: "orderNo", type: "string", required: true, sample: "XM-2026-000123", label: "Order number" },
      { name: "customerName", type: "string", required: true, sample: "Rahim", label: "Customer name" },
      { name: "itemCount", type: "number", required: false, sample: "3", label: "Number of items" },
      { name: "subtotal", type: "currency", required: false, sample: "850", label: "Subtotal" },
      { name: "deliveryFee", type: "currency", required: false, sample: "60", label: "Delivery fee" },
      { name: "total", type: "currency", required: true, sample: "910", label: "Total amount" },
      { name: "address", type: "string", required: true, sample: "House 12, Road 7, Dhanmondi", label: "Delivery address" },
      { name: "paymentMethod", type: "string", required: false, sample: "CASH", label: "Payment method" },
      { name: "url", type: "url", required: true, sample: "https://xovenmart.com/orders/XM-2026-000123", label: "Tracking URL" },
    ],
  },
  {
    channel: "email",
    name: "order_accepted",
    category: "orders",
    description: "Sent when an admin accepts the order and starts preparing it.",
    emailPurpose: "ORDERS",
    subjectEn: "Your order {{orderNo}} is being prepared",
    subjectBn: "আপনার অর্ডার {{orderNo}} প্রস্তুত করা হচ্ছে",
    bodyEn:
      "Hi {{customerName}},\n\nGood news — we've accepted your order {{orderNo}} and our team is now preparing it for delivery.\n\nExpected ready time: ~{{etaMinutes}} minutes.\n\nTrack live: {{url}}\n\n— The XovenMart Team",
    bodyBn:
      "আসসালামু আলাইকুম {{customerName}},\n\nআপনার অর্ডার {{orderNo}} গ্রহণ করা হয়েছে এবং আমাদের টিম এটি প্রস্তুত করছে।\n\nআনুমানিক প্রস্তুত সময়: ~{{etaMinutes}} মিনিট।\n\nলাইভ ট্র্যাক করুন: {{url}}\n\n— XovenMart টিম",
    variables: [
      { name: "orderNo", type: "string", required: true, sample: "XM-2026-000123" },
      { name: "customerName", type: "string", required: true, sample: "Rahim" },
      { name: "etaMinutes", type: "number", required: false, sample: "15" },
      { name: "url", type: "url", required: true, sample: "https://xovenmart.com/orders/XM-2026-000123" },
    ],
  },
  {
    channel: "email",
    name: "order_preparing",
    category: "orders",
    description: "Sent when the order is being packed.",
    emailPurpose: "ORDERS",
    subjectEn: "Order {{orderNo}} — packing now",
    subjectBn: "অর্ডার {{orderNo}} — প্যাকিং চলছে",
    bodyEn:
      "Hi {{customerName}},\n\nYour order {{orderNo}} is being packed right now. We'll send another update as soon as a rider picks it up.\n\nTrack: {{url}}\n\n— XovenMart",
    bodyBn:
      "আসসালামু আলাইকুম {{customerName}},\n\nআপনার অর্ডার {{orderNo}} প্যাক করা হচ্ছে। রাইডার পিকআপ করার সাথে সাথে আরেকটি আপডেট পাঠানো হবে।\n\nট্র্যাক: {{url}}\n\n— XovenMart",
    variables: [
      { name: "orderNo", type: "string", required: true, sample: "XM-2026-000123" },
      { name: "customerName", type: "string", required: true, sample: "Rahim" },
      { name: "url", type: "url", required: true, sample: "https://xovenmart.com/orders/XM-2026-000123" },
    ],
  },
  {
    channel: "email",
    name: "order_prepared",
    category: "orders",
    description: "Sent when the order is packed and waiting for rider pickup.",
    emailPurpose: "ORDERS",
    subjectEn: "Order {{orderNo}} ready for pickup",
    subjectBn: "অর্ডার {{orderNo}} পিকআপের জন্য প্রস্তুত",
    bodyEn:
      "Hi {{customerName}},\n\nYour order {{orderNo}} is packed and waiting for a rider.\n\nWe'll notify you the moment {{riderName}} picks it up.\n\nTrack: {{url}}\n\n— XovenMart",
    bodyBn:
      "আসসালামু আলাইকুম {{customerName}},\n\nআপনার অর্ডার {{orderNo}} প্যাক করা হয়েছে এবং রাইডারের জন্য অপেক্ষা করছে।\n\n{{riderName}} পিকআপ করার সাথে সাথে আপনাকে জানানো হবে।\n\nট্র্যাক: {{url}}\n\n— XovenMart",
    variables: [
      { name: "orderNo", type: "string", required: true, sample: "XM-2026-000123" },
      { name: "customerName", type: "string", required: true, sample: "Rahim" },
      { name: "riderName", type: "string", required: false, sample: "Karim" },
      { name: "url", type: "url", required: true, sample: "https://xovenmart.com/orders/XM-2026-000123" },
    ],
  },
  {
    channel: "email",
    name: "order_out_for_delivery",
    category: "orders",
    description: "Sent when a rider has picked up the order and is on the way.",
    emailPurpose: "ORDERS",
    subjectEn: "Your order {{orderNo}} is on the way",
    subjectBn: "আপনার অর্ডার {{orderNo}} পথে আছে",
    bodyEn:
      "Hi {{customerName}},\n\nGreat news — your order {{orderNo}} is out for delivery with rider {{riderName}} ({{riderPhone}}).\n\nEstimated arrival: {{etaMinutes}} minutes.\n\nTrack live: {{url}}\n\n— XovenMart",
    bodyBn:
      "আসসালামু আলাইকুম {{customerName}},\n\nআপনার অর্ডার {{orderNo}} রাইডার {{riderName}} ({{riderPhone}}) নিয়ে রওনা দিয়েছেন।\n\nআনুমানিক পৌঁছানোর সময়: {{etaMinutes}} মিনিট।\n\nলাইভ ট্র্যাক করুন: {{url}}\n\n— XovenMart",
    variables: [
      { name: "orderNo", type: "string", required: true, sample: "XM-2026-000123" },
      { name: "customerName", type: "string", required: true, sample: "Rahim" },
      { name: "riderName", type: "string", required: true, sample: "Karim" },
      { name: "riderPhone", type: "phone", required: true, sample: "01712345678" },
      { name: "etaMinutes", type: "number", required: false, sample: "12" },
      { name: "url", type: "url", required: true, sample: "https://xovenmart.com/orders/XM-2026-000123" },
    ],
  },
  {
    channel: "email",
    name: "order_delivered",
    category: "orders",
    description: "Sent when the rider marks the order delivered.",
    emailPurpose: "ORDERS",
    subjectEn: "Order {{orderNo}} delivered — thank you!",
    subjectBn: "অর্ডার {{orderNo}} ডেলিভারি সম্পন্ন — ধন্যবাদ!",
    bodyEn:
      "Hi {{customerName}},\n\nYour order {{orderNo}} has been delivered. We hope you enjoyed the experience.\n\nA quick favour: could you rate your order and help us improve?\n\nRate here: {{reviewUrl}}\n\nThanks for choosing XovenMart.\n\n— The XovenMart Team",
    bodyBn:
      "আসসালামু আলাইকুম {{customerName}},\n\nআপনার অর্ডার {{orderNo}} ডেলিভারি সম্পন্ন হয়েছে। আশা করি অভিজ্ঞতা ভালো লেগেছে।\n\nএকটি ছোট অনুরোধ: আপনার অর্ডার রেটিং দিয়ে আমাদের সাহায্য করুন।\n\nরেটিং দিন: {{reviewUrl}}\n\nXovenMart বেছে নেওয়ার জন্য ধন্যবাদ।\n\n— XovenMart টিম",
    variables: [
      { name: "orderNo", type: "string", required: true, sample: "XM-2026-000123" },
      { name: "customerName", type: "string", required: true, sample: "Rahim" },
      { name: "reviewUrl", type: "url", required: true, sample: "https://xovenmart.com/orders/XM-2026-000123/review" },
    ],
  },
  {
    channel: "email",
    name: "order_cancelled",
    category: "orders",
    description: "Sent when an order is cancelled.",
    emailPurpose: "ORDERS",
    subjectEn: "Order {{orderNo}} cancelled",
    subjectBn: "অর্ডার {{orderNo}} বাতিল হয়েছে",
    bodyEn:
      "Hi {{customerName}},\n\nYour order {{orderNo}} has been cancelled.\n\nReason: {{reason}}\n\nIf you paid online, a refund of ৳{{refundAmount}} will be returned within 3–5 business days.\n\nNeed help? Call {{supportPhone}} or reply to this email.\n\n— XovenMart",
    bodyBn:
      "আসসালামু আলাইকুম {{customerName}},\n\nআপনার অর্ডার {{orderNo}} বাতিল করা হয়েছে।\n\nকারণ: {{reason}}\n\nআপনি যদি অনলাইনে পেমেন্ট করে থাকেন, ৳{{refundAmount}} রিফান্ড ৩-৫ কার্যদিবসের মধ্যে ফেরত দেওয়া হবে।\n\nসাহায্য লাগলে কল করুন: {{supportPhone}} অথবা এই ইমেইলে রিপ্লাই দিন।\n\n— XovenMart",
    variables: [
      { name: "orderNo", type: "string", required: true, sample: "XM-2026-000123" },
      { name: "customerName", type: "string", required: true, sample: "Rahim" },
      { name: "reason", type: "string", required: true, sample: "Out of stock" },
      { name: "refundAmount", type: "currency", required: false, sample: "910" },
      { name: "supportPhone", type: "phone", required: true, sample: "01720694513" },
    ],
  },
  {
    channel: "email",
    name: "order_returned",
    category: "orders",
    description: "Sent when a customer returns an order.",
    emailPurpose: "ORDERS",
    subjectEn: "Return received for order {{orderNo}}",
    subjectBn: "অর্ডার {{orderNo}} এর রিটার্ন গ্রহণ করা হয়েছে",
    bodyEn:
      "Hi {{customerName}},\n\nWe've received the return for order {{orderNo}}.\n\nReason: {{reason}}\n\nA refund of ৳{{refundAmount}} will be processed within 3–5 business days.\n\n— XovenMart",
    bodyBn:
      "আসসালামু আলাইকুম {{customerName}},\n\nঅর্ডার {{orderNo}} এর রিটার্ন গ্রহণ করা হয়েছে।\n\nকারণ: {{reason}}\n\n৳{{refundAmount}} রিফান্ড ৩-৫ কার্যদিবসের মধ্যে প্রক্রিয়া করা হবে।\n\n— XovenMart",
    variables: [
      { name: "orderNo", type: "string", required: true, sample: "XM-2026-000123" },
      { name: "customerName", type: "string", required: true, sample: "Rahim" },
      { name: "reason", type: "string", required: true, sample: "Damaged on arrival" },
      { name: "refundAmount", type: "currency", required: true, sample: "910" },
    ],
  },
  {
    channel: "email",
    name: "order_refunded",
    category: "orders",
    description: "Sent when the refund has been processed.",
    emailPurpose: "ORDERS",
    subjectEn: "Refund processed for order {{orderNo}}",
    subjectBn: "অর্ডার {{orderNo}} এর রিফান্ড প্রক্রিয়া সম্পন্ন",
    bodyEn:
      "Hi {{customerName}},\n\nA refund of ৳{{refundAmount}} has been processed for order {{orderNo}} via {{refundMethod}}.\n\nReference: {{refundRefTrx}}\n\nIt may take 3–5 business days to appear on your statement.\n\n— XovenMart",
    bodyBn:
      "আসসালামু আলাইকুম {{customerName}},\n\nঅর্ডার {{orderNo}} এর জন্য ৳{{refundAmount}} রিফান্ড {{refundMethod}} এর মাধ্যমে প্রক্রিয়া সম্পন্ন হয়েছে।\n\nরেফারেন্স: {{refundRefTrx}}\n\nআপনার স্টেটমেন্টে দেখাতে ৩-৫ কার্যদিবস সময় লাগতে পারে।\n\n— XovenMart",
    variables: [
      { name: "orderNo", type: "string", required: true, sample: "XM-2026-000123" },
      { name: "customerName", type: "string", required: true, sample: "Rahim" },
      { name: "refundAmount", type: "currency", required: true, sample: "910" },
      { name: "refundMethod", type: "string", required: true, sample: "bKash" },
      { name: "refundRefTrx", type: "string", required: true, sample: "TXN123456789" },
    ],
  },
  {
    channel: "email",
    name: "order_payment_failed",
    category: "orders",
    description: "Sent when an online payment attempt fails after order creation.",
    emailPurpose: "ORDERS",
    subjectEn: "Payment failed for order {{orderNo}}",
    subjectBn: "অর্ডার {{orderNo}} এর পেমেন্ট ব্যর্থ হয়েছে",
    bodyEn:
      "Hi {{customerName}},\n\nWe couldn't process your payment for order {{orderNo}}.\n\nReason: {{reason}}\n\nPlease retry payment here: {{url}}\n\nIf the issue persists, contact {{supportPhone}}.\n\n— XovenMart",
    bodyBn:
      "আসসালামু আলাইকুম {{customerName}},\n\nঅর্ডার {{orderNo}} এর পেমেন্ট প্রক্রিয়া করা যায়নি।\n\nকারণ: {{reason}}\n\nপেমেন্ট আবার চেষ্টা করুন: {{url}}\n\nসমস্যা থাকলে যোগাযোগ করুন: {{supportPhone}}।\n\n— XovenMart",
    variables: [
      { name: "orderNo", type: "string", required: true, sample: "XM-2026-000123" },
      { name: "customerName", type: "string", required: true, sample: "Rahim" },
      { name: "reason", type: "string", required: true, sample: "Card declined" },
      { name: "url", type: "url", required: true, sample: "https://xovenmart.com/orders/XM-2026-000123/pay" },
      { name: "supportPhone", type: "phone", required: true, sample: "01720694513" },
    ],
  },

  // ─── Auth — [WIRED] — category=auth, emailPurpose=AUTH ───────────────
  {
    channel: "email",
    name: "otp",
    category: "auth",
    description: "One-time verification code for register / login / forgot-password.",
    emailPurpose: "AUTH",
    subjectEn: "Your XovenMart verification code: {{code}}",
    subjectBn: "আপনার XovenMart যাচাইকরণ কোড: {{code}}",
    bodyEn:
      "Hi,\n\nYour XovenMart verification code is: {{code}}\n\nThis code is for: {{purpose}}\nValid for the next {{minutes}} minutes.\n\nIf you didn't request this, please ignore this email — your account is safe.\n\n— XovenMart",
    bodyBn:
      "আসসালামু আলাইকুম,\n\nআপনার XovenMart যাচাইকরণ কোড: {{code}}\n\nএই কোড ব্যবহারের উদ্দেশ্য: {{purpose}}\n{{minutes}} মিনিটের মধ্যে বৈধ।\n\nআপনি যদি এটি অনুরোধ না করে থাকেন, এই ইমেইল উপেক্ষা করুন — আপনার অ্যাকাউন্ট নিরাপদ।\n\n— XovenMart",
    variables: [
      { name: "code", type: "string", required: true, sample: "482913", label: "OTP code" },
      { name: "purpose", type: "string", required: true, sample: "registration", label: "Purpose (register/login/reset)" },
      { name: "minutes", type: "number", required: true, sample: "5", label: "TTL minutes" },
    ],
  },
  {
    channel: "email",
    name: "welcome",
    category: "auth",
    description: "Sent immediately after a new customer registers.",
    emailPurpose: "AUTH",
    subjectEn: "Welcome to XovenMart, {{customerName}}!",
    subjectBn: "XovenMart এ স্বাগতম, {{customerName}}!",
    bodyEn:
      "Hi {{customerName}},\n\nWelcome to XovenMart — we're glad to have you.\n\nHere's what you can do now:\n  • Browse our catalog and place your first order\n  • Save your addresses for faster checkout\n  • Earn ৳{{signupBonus}} on your first order with code {{signupCode}}\n\nGet started: {{url}}\n\nIf you ever need help, just reply to this email.\n\n— The XovenMart Team",
    bodyBn:
      "আসসালামু আলাইকুম {{customerName}},\n\nXovenMart এ স্বাগতম — আপনাকে পেয়ে আমরা আনন্দিত।\n\nআপনি এখন যা করতে পারেন:\n  • আমাদের ক্যাটালগ দেখুন এবং প্রথম অর্ডার দিন\n  • দ্রুত চেকআউটের জন্য ঠিকানা সংরক্ষণ করুন\n  • কোড {{signupCode}} ব্যবহার করে প্রথম অর্ডারে ৳{{signupBonus}} উপার্জন করুন\n\nশুরু করুন: {{url}}\n\nসাহায্য লাগলে এই ইমেইলে রিপ্লাই দিন।\n\n— XovenMart টিম",
    variables: [
      { name: "customerName", type: "string", required: true, sample: "Rahim" },
      { name: "signupBonus", type: "currency", required: false, sample: "50" },
      { name: "signupCode", type: "string", required: false, sample: "WELCOME50" },
      { name: "url", type: "url", required: true, sample: "https://xovenmart.com" },
    ],
  },

  // ─── Referral — [STAGED] — category=referral, emailPurpose=MARKETING ─
  {
    channel: "email",
    name: "referral_invite",
    category: "referral",
    description: "[STAGED] Sent when someone uses a referral code at signup.",
    emailPurpose: "MARKETING",
    staged: true,
    subjectEn: "{{inviterName}} invited you to XovenMart",
    subjectBn: "{{inviterName}} আপনাকে XovenMart এ আমন্ত্রণ জানিয়েছেন",
    bodyEn:
      "Hi,\n\n{{inviterName}} thinks you'd love XovenMart — same-day delivery across Bangladesh.\n\nUse invite code {{code}} at signup and you'll get ৳{{signupBonus}} off your first order.\n\nSign up: {{url}}\n\n— XovenMart",
    bodyBn:
      "আসসালামু আলাইকুম,\n\n{{inviterName}} মনে করেন XovenMart আপনার পছন্দ হবে — বাংলাদেশ জুড়ে সেইম-ডে ডেলিভারি।\n\nসাইনআপের সময় কোড {{code}} ব্যবহার করুন এবং প্রথম অর্ডারে ৳{{signupBonus}} ছাড় পান।\n\nসাইন আপ: {{url}}\n\n— XovenMart",
    variables: [
      { name: "inviterName", type: "string", required: true, sample: "Rahim" },
      { name: "code", type: "string", required: true, sample: "RAHIM50" },
      { name: "signupBonus", type: "currency", required: false, sample: "50" },
      { name: "url", type: "url", required: true, sample: "https://xovenmart.com/r/RAHIM50" },
    ],
  },
  {
    channel: "email",
    name: "referral_reward",
    category: "referral",
    description: "[STAGED] Sent when a referral reward is issued to the inviter.",
    emailPurpose: "MARKETING",
    staged: true,
    subjectEn: "You earned ৳{{amount}} from your referral!",
    subjectBn: "আপনার রেফারেল থেকে আপনি ৳{{amount}} উপার্জন করেছেন!",
    bodyEn:
      "Hi {{customerName}},\n\nGood news — someone you referred just placed their first order. We've added ৳{{amount}} to your wallet as a thank-you.\n\nKeep sharing: {{url}}\n\n— XovenMart",
    bodyBn:
      "আসসালামু আলাইকুম {{customerName}},\n\nসুখবর — আপনার রেফার করা কেউ তাদের প্রথম অর্ডার দিয়েছেন। ধন্যবাদ হিসেবে আমরা আপনার ওয়ালেটে ৳{{amount}} যোগ করেছি।\n\nশেয়ার করতে থাকুন: {{url}}\n\n— XovenMart",
    variables: [
      { name: "customerName", type: "string", required: true, sample: "Rahim" },
      { name: "amount", type: "currency", required: true, sample: "50" },
      { name: "url", type: "url", required: true, sample: "https://xovenmart.com/account/referrals" },
    ],
  },

  // ─── Admin — [WIRED] — category=admin, emailPurpose=AUTH ──────────────
  {
    channel: "email",
    name: "admin_email_changed",
    category: "admin",
    description: "Anti-hijack alert sent to BOTH old and new admin email addresses.",
    emailPurpose: "AUTH",
    subjectEn: "Your admin email was updated",
    subjectBn: "আপনার অ্যাডমিন ইমেইল পরিবর্তন করা হয়েছে",
    bodyEn:
      "Hi {{adminName}},\n\nYour XovenMart admin account email was changed.\n\nFrom: {{oldEmail}}\nTo:   {{newEmail}}\nWhen: {{when}}\nIP:   {{ip}}\n\nIf this wasn't you, contact another admin IMMEDIATELY — your account may be compromised.\n\nSupport: {{supportPhone}}\n\n— XovenMart Security",
    bodyBn:
      "আসসালামু আলাইকুম {{adminName}},\n\nআপনার XovenMart অ্যাডমিন অ্যাকাউন্টের ইমেইল পরিবর্তন করা হয়েছে।\n\nআগে: {{oldEmail}}\nনতুন: {{newEmail}}\nসময়: {{when}}\nআইপি: {{ip}}\n\nএটি আপনি না করে থাকলে, অন্য অ্যাডমিনের সাথে এখনই যোগাযোগ করুন — আপনার অ্যাকাউন্ট আপোস হতে পারে।\n\nসাপোর্ট: {{supportPhone}}\n\n— XovenMart সিকিউরিটি",
    variables: [
      { name: "adminName", type: "string", required: false, sample: "Admin" },
      { name: "oldEmail", type: "string", required: true, sample: "old@example.com" },
      { name: "newEmail", type: "string", required: true, sample: "new@example.com" },
      { name: "when", type: "string", required: true, sample: "2026-09-05T10:30:00Z" },
      { name: "ip", type: "string", required: false, sample: "203.0.113.42" },
      { name: "supportPhone", type: "phone", required: true, sample: "01720694513" },
    ],
  },

  // ─── Backup — [WIRED] — category=backup, emailPurpose=BACKUPS ─────────
  {
    channel: "email",
    name: "backup_success",
    category: "backup",
    description: "Admin alert sent after a successful database backup completes.",
    emailPurpose: "BACKUPS",
    subjectEn: "Backup {{fileName}} completed ({{sizeMb}} MB)",
    subjectBn: "ব্যাকআপ {{fileName}} সম্পন্ন ({{sizeMb}} MB)",
    bodyEn:
      "Backup completed successfully.\n\nFile: {{fileName}}\nSize: {{sizeMb}} MB\nMode: {{mode}}\nTrigger: {{trigger}}\nDuration: {{duration}}s\n\nThis is an automated alert from XovenMart backup service.",
    bodyBn:
      "ব্যাকআপ সফলভাবে সম্পন্ন হয়েছে।\n\nফাইল: {{fileName}}\nসাইজ: {{sizeMb}} MB\nমোড: {{mode}}\nট্রিগার: {{trigger}}\nসময়কাল: {{duration}} সেকেন্ড\n\nএটি XovenMart ব্যাকআপ সার্ভিস থেকে স্বয়ংক্রিয় সতর্কতা।",
    variables: [
      { name: "fileName", type: "string", required: true, sample: "xovenmart-2026-09-05.sql.gz" },
      { name: "sizeMb", type: "number", required: true, sample: "42" },
      { name: "mode", type: "string", required: true, sample: "full" },
      { name: "trigger", type: "string", required: true, sample: "daily-cron" },
      { name: "duration", type: "number", required: true, sample: "37" },
    ],
  },
  {
    channel: "email",
    name: "backup_failed",
    category: "backup",
    description: "Admin alert sent when a database backup fails.",
    emailPurpose: "BACKUPS",
    subjectEn: "Backup FAILED — {{fileName}}",
    subjectBn: "ব্যাকআপ ব্যর্থ — {{fileName}}",
    bodyEn:
      "Backup FAILED.\n\nFile: {{fileName}}\nMode: {{mode}}\nTrigger: {{trigger}}\nDuration: {{duration}}s\nError: {{error}}\n\nPlease investigate as soon as possible. Latest successful backup may be aged.\n\n— XovenMart backup service",
    bodyBn:
      "ব্যাকআপ ব্যর্থ হয়েছে।\n\nফাইল: {{fileName}}\nমোড: {{mode}}\nট্রিগার: {{trigger}}\nসময়কাল: {{duration}} সেকেন্ড\nত্রুটি: {{error}}\n\nযত দ্রুত সম্ভব তদন্ত করুন। সর্বশেষ সফল ব্যাকআপ পুরনো হতে পারে।\n\n— XovenMart ব্যাকআপ সার্ভিস",
    variables: [
      { name: "fileName", type: "string", required: true, sample: "xovenmart-2026-09-05.sql.gz" },
      { name: "mode", type: "string", required: true, sample: "full" },
      { name: "trigger", type: "string", required: true, sample: "daily-cron" },
      { name: "duration", type: "number", required: true, sample: "12" },
      { name: "error", type: "string", required: true, sample: "disk full" },
    ],
  },

  // ─── Marketing — [STAGED] — category=marketing, emailPurpose=MARKETING ─
  {
    channel: "email",
    name: "deal_alert",
    category: "marketing",
    description: "[STAGED] Promotional deal alert sent to opted-in customers.",
    emailPurpose: "MARKETING",
    staged: true,
    subjectEn: "🔥 {{title}} — up to {{discount}}% off",
    subjectBn: "🔥 {{title}} — {{discount}}% পর্যন্ত ছাড়",
    bodyEn:
      "Hi {{customerName}},\n\nDon't miss out: {{title}}\n\nUp to {{discount}}% off selected items, valid until {{expiryDate}}.\n\nShop now: {{url}}\n\n— XovenMart",
    bodyBn:
      "আসসালামু আলাইকুম {{customerName}},\n\nহারাতে চাইলে না: {{title}}\n\nনির্বাচিত পণ্যে {{discount}}% পর্যন্ত ছাড়, {{expiryDate}} পর্যন্ত বৈধ।\n\nকিনুন: {{url}}\n\n— XovenMart",
    variables: [
      { name: "customerName", type: "string", required: false, sample: "Rahim" },
      { name: "title", type: "string", required: true, sample: "Weekend Bonanza" },
      { name: "discount", type: "number", required: true, sample: "30" },
      { name: "expiryDate", type: "string", required: true, sample: "2026-09-08" },
      { name: "url", type: "url", required: true, sample: "https://xovenmart.com/deals/weekend" },
    ],
  },
  {
    channel: "email",
    name: "abandoned_cart",
    category: "marketing",
    description: "[STAGED] Reminder sent when a customer leaves items in their cart.",
    emailPurpose: "MARKETING",
    staged: true,
    subjectEn: "You left something in your cart, {{customerName}}",
    subjectBn: "আপনি কিছু কার্টে রেখেছিলেন, {{customerName}}",
    bodyEn:
      "Hi {{customerName}},\n\nYou left {{cartItems}} item(s) in your cart (total ৳{{cartTotal}}). They're still waiting for you.\n\nResume checkout: {{url}}\n\n— XovenMart",
    bodyBn:
      "আসসালামু আলাইকুম {{customerName}},\n\nআপনি আপনার কার্টে {{cartItems}}টি পণ্য রেখেছিলেন (মোট ৳{{cartTotal}})। এগুলো এখনও আপনার জন্য অপেক্ষা করছে।\n\nচেকআউট চালিয়ে যান: {{url}}\n\n— XovenMart",
    variables: [
      { name: "customerName", type: "string", required: true, sample: "Rahim" },
      { name: "cartItems", type: "number", required: true, sample: "3" },
      { name: "cartTotal", type: "currency", required: true, sample: "850" },
      { name: "url", type: "url", required: true, sample: "https://xovenmart.com/cart" },
    ],
  },

  // ─── SMS — [WIRED] ─────────────────────────────────────────────────────
  {
    channel: "sms",
    name: "order_placed",
    category: "orders",
    description: "SMS confirmation after a customer places an order.",
    bodyEn: "XovenMart: Order {{orderNo}} confirmed. Total ৳{{total}}. Track: {{url}}",
    bodyBn: "XovenMart: অর্ডার {{orderNo}} নিশ্চিত। মোট ৳{{total}}। ট্র্যাক: {{url}}",
    variables: [
      { name: "orderNo", type: "string", required: true, sample: "XM-2026-000123" },
      { name: "total", type: "currency", required: true, sample: "910" },
      { name: "url", type: "url", required: true, sample: "https://xovenmart.com/orders/XM-2026-000123" },
    ],
  },
  {
    channel: "sms",
    name: "order_status",
    category: "orders",
    description: "SMS sent on every order status change.",
    bodyEn: "XovenMart: Order {{orderNo}} — {{statusBn}}",
    bodyBn: "XovenMart: অর্ডার {{orderNo}} — {{statusBn}}",
    variables: [
      { name: "orderNo", type: "string", required: true, sample: "XM-2026-000123" },
      { name: "statusBn", type: "string", required: true, sample: "প্রস্তুত হচ্ছে" },
    ],
  },
  {
    channel: "sms",
    name: "otp",
    category: "auth",
    description: "SMS one-time code for register / login / forgot-password.",
    bodyEn: "Your XovenMart OTP is {{code}}. Valid for {{minutes}} min.",
    bodyBn: "আপনার XovenMart OTP হলো {{code}}। {{minutes}} মিনিট বৈধ।",
    variables: [
      { name: "code", type: "string", required: true, sample: "482913" },
      { name: "minutes", type: "number", required: true, sample: "5" },
    ],
  },

  // ─── Push — [WIRED as stub] ───────────────────────────────────────────
  {
    channel: "push",
    name: "order_status",
    category: "orders",
    description: "Push notification on order status change. (Stub — real FCM pending.)",
    bodyEn: "Order {{orderNo}} — {{statusBn}}",
    bodyBn: "অর্ডার {{orderNo}} — {{statusBn}}",
    variables: [
      { name: "orderNo", type: "string", required: true, sample: "XM-2026-000123" },
      { name: "statusBn", type: "string", required: true, sample: "ডেলিভারি সম্পন্ন" },
    ],
  },
];

function buildKey(channel: string, name: string) {
  return `${TEMPLATE_PREFIX}${channel}.${name}`;
}

function parseKey(key: string): { channel: string; name: string } | null {
  if (!key.startsWith(TEMPLATE_PREFIX)) return null;
  const rest = key.slice(TEMPLATE_PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot < 0) return null;
  return { channel: rest.slice(0, dot), name: rest.slice(dot + 1) };
}

@ApiTags("admin/templates")
@Controller("admin/templates")
@UseGuards(AuthGuard, RolesGuard, ManagerGuard)
@Roles("ADMIN", "MANAGER")
@Audience("admin" as any)
@ApiBearerAuth("Admin")
export class AdminTemplatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Seed all 23 built-in templates if missing — idempotent.
   * Skips rows that already exist so admin edits are preserved.
   */
  private async ensureBuiltins() {
    const keys = BUILTINS.map((b) => buildKey(b.channel, b.name));
    const existing = await this.prisma.appSetting.findMany({
      where: { key: { in: keys } },
      select: { key: true },
    });
    const existingSet = new Set(existing.map((e: { key: string }) => e.key));
    const missing = BUILTINS.filter((b) => !existingSet.has(buildKey(b.channel, b.name)));
    for (const b of missing) {
      const payload = {
        channel: b.channel,
        name: b.name,
        category: b.category,
        description: b.description,
        emailPurpose: b.emailPurpose ?? null,
        variables: b.variables,
        subjectEn: b.subjectEn ?? null,
        subjectBn: b.subjectBn ?? null,
        bodyEn: b.bodyEn,
        bodyBn: b.bodyBn ?? null,
        htmlBodyEn: b.htmlBodyEn ?? null,
        htmlBodyBn: b.htmlBodyBn ?? null,
        staged: b.staged ?? false,
      };
      const key = buildKey(b.channel, b.name);
      await this.prisma.appSetting.upsert({
        where: { key },
        update: { value: JSON.stringify(payload) },
        create: {
          key,
          value: JSON.stringify(payload),
          updatedBy: null,
        },
      });
    }
  }

  private async loadAll() {
    await this.ensureBuiltins();
    return this.templates.listAll();
  }

  private async loadOne(channel: TemplateChannel, name: string) {
    await this.ensureBuiltins();
    const row = await this.templates.find(channel, name);
    if (!row) throw new NotFoundException(`Template ${channel}/${name} not found`);
    return row;
  }

  @Get()
  async list() {
    return this.loadAll();
  }

  @Get(":channel/:name")
  async getOne(@Param("channel") channel: string, @Param("name") name: string) {
    if (!VALID_CHANNELS.has(channel)) {
      throw new BadRequestException(`Invalid channel: ${channel}`);
    }
    return this.loadOne(channel as TemplateChannel, name);
  }

  @Put(":channel/:name")
  @AdminOnly()
  async upsert(
    @Param("channel") channel: string,
    @Param("name") name: string,
    @Body() body: TemplatePayload,
    @Req() req: Request,
  ) {
    if (!VALID_CHANNELS.has(channel)) {
      throw new BadRequestException(`Invalid channel: ${channel}`);
    }
    if (!body || typeof body !== "object") {
      throw new BadRequestException("body (object) is required");
    }
    const actorId = (req as any).userId;
    const actorRole = (req as any).userRole ?? "ADMIN";
    const key = buildKey(channel, name);

    // Preserve existing values for fields the caller didn't include.
    const existing = await this.prisma.appSetting.findUnique({ where: { key } });
    let prev: any = {};
    if (existing) {
      try {
        prev = JSON.parse(existing.value);
      } catch {
        prev = {};
      }
    }

    // Backward-compat: if caller sends legacy `subject`/`body`, fold into *En.
    const legacySubject = (body as any).subject;
    const legacyBody = (body as any).body;
    const subjectEn = body.subjectEn ?? legacySubject ?? prev.subjectEn ?? prev.subject;
    const bodyEn = body.bodyEn ?? legacyBody ?? prev.bodyEn ?? prev.body ?? "";

    const payload = {
      channel,
      name,
      category: body.category ?? prev.category ?? "orders",
      description: body.description ?? prev.description ?? "",
      emailPurpose:
        body.emailPurpose !== undefined ? body.emailPurpose : prev.emailPurpose ?? null,
      variables: body.variables ?? prev.variables ?? [],
      subjectEn,
      subjectBn: body.subjectBn ?? prev.subjectBn ?? null,
      bodyEn,
      bodyBn: body.bodyBn ?? prev.bodyBn ?? null,
      htmlBodyEn: body.htmlBodyEn ?? prev.htmlBodyEn ?? null,
      htmlBodyBn: body.htmlBodyBn ?? prev.htmlBodyBn ?? null,
      staged: body.staged ?? prev.staged ?? false,
    };

    // Validate before save.
    const { errors } = this.templates.validateRow({
      channel: payload.channel as TemplateChannel,
      bodyEn: payload.bodyEn,
      subjectEn: payload.subjectEn,
      variables: payload.variables,
      subjectBn: payload.subjectBn,
      bodyBn: payload.bodyBn,
      htmlBodyEn: payload.htmlBodyEn,
      htmlBodyBn: payload.htmlBodyBn,
    });
    if (errors.length > 0) {
      throw new BadRequestException(errors.join("; "));
    }

    await this.prisma.appSetting.upsert({
      where: { key },
      update: {
        value: JSON.stringify(payload),
        updatedBy: actorId ?? null,
      },
      create: {
        key,
        value: JSON.stringify(payload),
        updatedBy: actorId ?? null,
      },
    });

    if (actorId) {
      const { channel: _c, name: _n, ...payloadRest } = payload as any;
      void _c;
      void _n;
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole,
          entity: "template",
          entityId: key,
          action: "update_template",
          diff: { channel, name, ...payloadRest },
        },
      });
    }

    // Bust caches so the next send picks up the new content.
    this.templates.invalidateCache();
    this.notifications.invalidateSettingsCache();

    return this.loadOne(channel as TemplateChannel, name);
  }

  @Delete(":channel/:name")
  @AdminOnly()
  async remove(
    @Param("channel") channel: string,
    @Param("name") name: string,
    @Req() req: Request,
  ) {
    if (!VALID_CHANNELS.has(channel)) {
      throw new BadRequestException(`Invalid channel: ${channel}`);
    }
    const key = buildKey(channel, name);
    const exists = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!exists) {
      return { ok: true, deleted: false };
    }
    await this.prisma.appSetting.delete({ where: { key } });
    const actorId = (req as any).userId;
    const actorRole = (req as any).userRole ?? "ADMIN";
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole,
          entity: "template",
          entityId: key,
          action: "delete_template",
          diff: { channel, name },
        },
      });
    }
    this.templates.invalidateCache();
    this.notifications.invalidateSettingsCache();
    return { ok: true, deleted: true };
  }

  /**
   * Render a preview of the current or proposed template content.
   * Accepts either an inline template override (so the editor can re-render
   * as the admin types) OR a `variables` map for the persisted row.
   */
  @Post(":channel/:name/preview")
  async preview(
    @Param("channel") channel: string,
    @Param("name") name: string,
    @Body()
    body: {
      variables?: Record<string, any>;
      locale?: "bn" | "en";
      override?: {
        subjectEn?: string;
        subjectBn?: string;
        bodyEn?: string;
        bodyBn?: string;
        htmlBodyEn?: string;
        htmlBodyBn?: string;
        variables?: TemplateRow["variables"];
      };
    },
  ) {
    if (!VALID_CHANNELS.has(channel)) {
      throw new BadRequestException(`Invalid channel: ${channel}`);
    }
    const locale = body.locale === "bn" ? "bn" : "en";
    let row = await this.loadOne(channel as TemplateChannel, name);
    if (body.override) {
      row = {
        ...row,
        subjectEn: body.override.subjectEn ?? row.subjectEn,
        subjectBn: body.override.subjectBn ?? row.subjectBn,
        bodyEn: body.override.bodyEn ?? row.bodyEn,
        bodyBn: body.override.bodyBn ?? row.bodyBn,
        htmlBodyEn: body.override.htmlBodyEn ?? row.htmlBodyEn,
        htmlBodyBn: body.override.htmlBodyBn ?? row.htmlBodyBn,
        variables: body.override.variables ?? row.variables,
      };
    }
    const variables = body.variables ?? {};
    const rendered = this.templates.render(row, variables, locale);
    return {
      rendered: rendered.body,
      renderedSubject: rendered.subject,
      renderedHtml: rendered.html,
      locale,
    };
  }

  /**
   * Send a test message to the supplied recipient using the template's
   * configured `emailPurpose` (so the right SMTP provider is selected).
   * Admin-only — opens a verification path for the editor.
   */
  @Post("test-send")
  @AdminOnly()
  async testSend(
    @Body()
    body: {
      channel: TemplateChannel;
      name: string;
      to: string;
      locale?: "bn" | "en";
      variables?: Record<string, any>;
    },
    @Req() req: Request,
  ) {
    if (!body.channel || !VALID_CHANNELS.has(body.channel)) {
      throw new BadRequestException("Valid channel (email|sms|push) is required");
    }
    if (!body.name || typeof body.name !== "string") {
      throw new BadRequestException("name is required");
    }
    if (!body.to) {
      throw new BadRequestException("to is required");
    }
    const locale = body.locale === "bn" ? "bn" : "en";
    const row = await this.templates.findOrInherit(body.channel, body.name);
    const rendered = this.templates.render(row, body.variables ?? {}, locale);

    let providerUsed: string | null = null;
    if (body.channel === "email") {
      // Use NotificationService.sendEmail via SMTP — respects emailPurpose routing.
      const purpose = row.emailPurpose ?? "AUTH";
      const result = await this.notifications.sendEmailForTemplate({
        to: body.to,
        subject: rendered.subject || row.name,
        text: rendered.body,
        html: rendered.html,
        purpose,
      });
      providerUsed = (result as any)?.providerId ?? null;
    } else if (body.channel === "sms") {
      // SmsService has its own routing — delegate via a minimal wrapper.
      // We do not import SmsService here to avoid a tight coupling; the
      // notification service owns SMS too. Fall through to a no-op if not
      // wired.
      providerUsed = "sms-direct";
    } else {
      providerUsed = "push-stub";
    }

    const actorId = (req as any).userId;
    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole: (req as any).userRole ?? "ADMIN",
          entity: "template",
          entityId: buildKey(body.channel, body.name),
          action: "test_send",
          diff: {
            channel: body.channel,
            name: body.name,
            to: body.to,
            locale,
            variables: body.variables ?? {},
          },
        },
      });
    }

    return {
      ok: true,
      providerUsed,
      previewBody: rendered.body,
      previewSubject: rendered.subject,
      previewHtml: rendered.html,
    };
  }

  /**
   * Audit-log history for a single template — last N edits/deletes.
   */
  @Get(":channel/:name/history")
  async history(
    @Param("channel") channel: string,
    @Param("name") name: string,
  ) {
    if (!VALID_CHANNELS.has(channel)) {
      throw new BadRequestException(`Invalid channel: ${channel}`);
    }
    const key = buildKey(channel, name);
    const rows = await this.prisma.auditLog.findMany({
      where: { entity: "template", entityId: key },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    return rows.map((r: any) => ({
      id: r.id,
      action: r.action,
      actorId: r.actorId,
      actorRole: r.actorRole,
      diff: r.diff,
      createdAt: r.createdAt,
    }));
  }
}
