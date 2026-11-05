/**
 * What the pound items still open on credit are worth in dollars at today's rate (backlog 190: revaluing balances at
 * the closing rate).
 *
 * A pound cost or sale kept on credit was booked in dollars at the rate of its day. Until it is settled, the pound
 * moves: a farmer who owes pounds owes fewer dollars when the pound falls, and one who is owed pounds is owed fewer.
 * The ledger already books the difference on the day of settlement (`farm_credit_settle`); this only shows it before,
 * so nothing is written — it is the same figure the settlement would book at this rate, today.
 */

export interface OpenPoundItem {
  /** The pounds as written. */
  pounds: number;
  /** The dollars it was booked at. */
  bookedUsd: number;
  /** A sale not yet received; otherwise a cost not yet paid. */
  receivable: boolean;
}

export interface Revaluation {
  items: number;
  /** Dollars as booked, and at today's rate, for what is owed and what is owed to the farmer. */
  payableBooked: number;
  payableToday: number;
  receivableBooked: number;
  receivableToday: number;
  /** In the farmer's favour when above zero: fewer dollars owed, or more dollars to come. */
  difference: number;
}

/** Null when there is no rate to value at, or nothing in pounds left open. */
export function revalueOpenPounds(items: OpenPoundItem[], poundsPerDollar: number): Revaluation | null {
  if (!Number.isFinite(poundsPerDollar) || poundsPerDollar <= 0) return null;
  const open = items.filter((i) => Number.isFinite(i.pounds) && i.pounds > 0 && Number.isFinite(i.bookedUsd));
  if (open.length === 0) return null;
  let payableBooked = 0, payableToday = 0, receivableBooked = 0, receivableToday = 0;
  for (const i of open) {
    const today = i.pounds / poundsPerDollar;
    if (i.receivable) {
      receivableBooked += i.bookedUsd;
      receivableToday += today;
    } else {
      payableBooked += i.bookedUsd;
      payableToday += today;
    }
  }
  return {
    items: open.length,
    payableBooked,
    payableToday,
    receivableBooked,
    receivableToday,
    difference: payableBooked - payableToday + (receivableToday - receivableBooked),
  };
}
