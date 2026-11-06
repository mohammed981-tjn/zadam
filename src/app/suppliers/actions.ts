"use server";

import { back, signedIn, str, translator } from "@/lib/supplyActions";
import {
  assignDeliveryStep,
  cancelDeliveryStep,
  confirmDeliveryStep,
  createGroupOrderStep,
  formFields,
  issueDeliveryCodeStep,
  markDeliveryPaidStep,
  markDepositStep,
  pledgeStep,
  removeProductStep,
  saveCarrierStep,
  saveProductStep,
  saveSupplierStep,
  setOrderStatusStep,
  setPledgeStatusStep,
  setSupplierActiveStep,
  setSupplierDocumentStep,
  withdrawPledgeStep,
  type Fields,
  type StepResult,
} from "@/lib/supplyCore";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/lib/i18n";

/**
 * Every supply step is a database function (supabase/migrations/
 * 20261012130000_supply_chain.sql) that checks who is taking it. These actions
 * carry the form there; the database is the boundary, and the checks in
 * src/lib/supplyCore.ts — shared with the app's routes (backlog 203) — only turn
 * an obviously incomplete form into a sentence before the round trip.
 */

type Step = (supabase: SupabaseClient, f: Fields, locale: Locale) => Promise<StepResult>;

/** Runs a step as the signed-in person and sends them back to [path] with its answer. */
async function run(fd: FormData, path: string, fn: Step): Promise<StepResult> {
  const { supabase } = await signedIn();
  const { locale } = await translator();
  const r = await fn(supabase, formFields(fd), locale);
  if (!r.ok) back(path, "error", r.message);
  return r;
}

const orderPath = (fd: FormData) => `/suppliers/orders/${str(fd, "order_id")}`;

// ── المورد ──────────────────────────────────────────────────────────────────

export async function saveSupplier(fd: FormData) {
  const r = await run(fd, "/suppliers/mine", saveSupplierStep);
  back("/suppliers/mine", "ok", r.message);
}

export async function setSupplierDocument(fd: FormData) {
  const r = await run(fd, "/suppliers/mine", setSupplierDocumentStep);
  back("/suppliers/mine", "ok", r.message);
}

export async function setSupplierActive(fd: FormData) {
  const r = await run(fd, "/suppliers/mine", setSupplierActiveStep);
  back("/suppliers/mine", "ok", r.message);
}

export async function saveProduct(fd: FormData) {
  const r = await run(fd, "/suppliers/mine", saveProductStep);
  back("/suppliers/mine", "ok", r.message);
}

export async function removeProduct(fd: FormData) {
  const r = await run(fd, "/suppliers/mine", removeProductStep);
  back("/suppliers/mine", "ok", r.message);
}

// ── الطلبات الجماعية ────────────────────────────────────────────────────────

export async function createGroupOrder(fd: FormData) {
  const r = await run(fd, "/suppliers/orders", createGroupOrderStep);
  back(`/suppliers/orders/${r.ok ? r.id : ""}`, "ok", r.message);
}

async function orderStep(fd: FormData, fn: Step) {
  const r = await run(fd, orderPath(fd), fn);
  back(orderPath(fd), "ok", r.message);
}

export async function pledge(fd: FormData) {
  await orderStep(fd, pledgeStep);
}

export async function withdrawPledge(fd: FormData) {
  await orderStep(fd, withdrawPledgeStep);
}

export async function markDeposit(fd: FormData) {
  await orderStep(fd, markDepositStep);
}

export async function setPledgeStatus(fd: FormData) {
  await orderStep(fd, setPledgeStatusStep);
}

export async function setOrderStatus(fd: FormData) {
  await orderStep(fd, setOrderStatusStep);
}

// ── الناقلون والتوصيل ───────────────────────────────────────────────────────

export async function saveCarrier(fd: FormData) {
  const r = await run(fd, "/suppliers/deliveries", saveCarrierStep);
  back("/suppliers/deliveries", "ok", r.message);
}

export async function assignDelivery(fd: FormData) {
  await orderStep(fd, assignDeliveryStep);
}

/** Called from the recipient's button; the code is shown once and never stored in clear. */
export async function issueDeliveryCode(deliveryId: string): Promise<{ code?: string; error?: string }> {
  const { supabase } = await signedIn();
  const { locale } = await translator();
  const r = await issueDeliveryCodeStep(supabase, deliveryId, locale);
  return r.ok ? { code: r.code } : { error: r.message };
}

export async function confirmDelivery(fd: FormData) {
  const r = await run(fd, "/suppliers/deliveries", confirmDeliveryStep);
  back("/suppliers/deliveries", "ok", r.message);
}

export async function markDeliveryPaid(fd: FormData) {
  const r = await run(fd, "/suppliers/deliveries", markDeliveryPaidStep);
  back("/suppliers/deliveries", "ok", r.message);
}

export async function cancelDelivery(fd: FormData) {
  const r = await run(fd, "/suppliers/deliveries", cancelDeliveryStep);
  back("/suppliers/deliveries", "ok", r.message);
}
