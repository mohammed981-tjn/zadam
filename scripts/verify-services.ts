/**
 * Checks the service catalogue and the contract plan it generates.
 *
 * buildMilestonePlan turns a set of chosen services into the priced, dated,
 * ordered phases of a contract, and nothing had ever asserted its behaviour.
 * The properties below are the ones a wrong answer would cost money on:
 * that a lump-sum service is never silently scaled by an area, that a service
 * which does not apply is dropped rather than priced at zero, and that the work
 * which can stop a project is scheduled before the work that merely delays one.
 */

import {
  SERVICE_CATALOGUE,
  SERVICE_BY_KEY,
  SERVICE_KIND_LABEL,
  SERVICE_UNIT_LABEL,
  buildMilestonePlan,
  deriveQuantity,
  type ServiceKey,
} from "../src/lib/services";

let fail = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(58)} ${detail}`);
}

console.log("\nCatalogue integrity");
{
  const keys = SERVICE_CATALOGUE.map((s) => s.key);
  check("no duplicate service keys", new Set(keys).size === keys.length,
    `${keys.length} entries`);
  check("every entry reachable by key",
    keys.every((k) => SERVICE_BY_KEY[k]?.key === k));
  check("every entry carries a note explaining its unit",
    SERVICE_CATALOGUE.every((s) => s.note.trim().length > 20));
  check("every kind has an Arabic label",
    SERVICE_CATALOGUE.every((s) => Boolean(SERVICE_KIND_LABEL[s.kind])));
  check("every unit has an Arabic label",
    SERVICE_CATALOGUE.every((s) => Boolean(SERVICE_UNIT_LABEL[s.unit])));
}

console.log("\nLump-sum services are never scaled");
{
  // The failure this guards against: a customs clearance costing the same for
  // ten feddans and a thousand, quietly multiplied by area on the invoice.
  const lumps = SERVICE_CATALOGUE.filter((s) => s.basis === "fixed");
  check("at least one fixed-basis service exists", lumps.length > 0,
    `${lumps.length} of ${SERVICE_CATALOGUE.length}`);
  check(
    "fixed basis returns 1 whatever the context",
    lumps.every(
      (s) =>
        deriveQuantity(s, { feddans: 1000, waterM3: 999_999, headCount: 5000 }) === 1,
    ),
  );
  check(
    "and still 1 with an empty context",
    lumps.every((s) => deriveQuantity(s, {}) === 1),
  );
}

console.log("\nInapplicable services are dropped, not zero-priced");
{
  const vet = SERVICE_BY_KEY.vet_program;
  check("a per-head service against a crop season yields null",
    deriveQuantity(vet, { feddans: 100, waterM3: 50_000 }) === null);

  const irrigation = SERVICE_BY_KEY.irrigation_install;
  check("a water-sized service against a herd yields null",
    deriveQuantity(irrigation, { headCount: 200, months: 6 }) === null);

  const plan = buildMilestonePlan(
    [
      { serviceKey: "vet_program", unitPrice: 900 },
      { serviceKey: "drone_survey", unitPrice: 3500 },
    ],
    { feddans: 100 },
    [],
  );
  check("the plan omits the inapplicable line entirely", plan.length === 1,
    `${plan.length} line(s)`);
  check("and keeps the applicable one", plan[0]?.serviceKey === "drone_survey");
  check("no line is ever priced at zero quantity",
    plan.every((m) => m.quantity > 0));
}

console.log("\nPreconditions are scheduled before dated field work");
{
  // A permit that is refused ends a project; a survey that runs late costs
  // days. The plan must put the first kind first.
  const phases = [
    { key: "land_prep" as const, startDate: "2026-06-01", endDate: "2026-06-20" },
    { key: "harvest" as const, startDate: "2026-11-01", endDate: "2026-11-20" },
  ];

  const plan = buildMilestonePlan(
    [
      { serviceKey: "harvest_service", unitPrice: 7000 },
      { serviceKey: "drone_survey", unitPrice: 3500 },
      { serviceKey: "land_permit", unitPrice: 250_000 },
      { serviceKey: "contract_notarization", unitPrice: 90_000 },
    ],
    { feddans: 100 },
    phases,
  );

  const prePositions = plan
    .filter((m) => SERVICE_BY_KEY[m.serviceKey].precondition)
    .map((m) => m.seq);
  const fieldPositions = plan
    .filter((m) => !SERVICE_BY_KEY[m.serviceKey].precondition)
    .map((m) => m.seq);

  check("preconditions come first",
    Math.max(...prePositions) < Math.min(...fieldPositions),
    `pre ${prePositions.join(",")} before field ${fieldPositions.join(",")}`);

  // The bug this pins: transport and advisory visits have no crop phase and
  // were sorting to the front alongside the permits. They are not
  // preconditions and must not jump the queue.
  const withTransport = buildMilestonePlan(
    [
      { serviceKey: "land_permit", unitPrice: 250_000 },
      { serviceKey: "transport", unitPrice: 60_000 },
      { serviceKey: "extension_visit", unitPrice: 15_000 },
      { serviceKey: "drone_survey", unitPrice: 3500 },
    ],
    { feddans: 100, months: 6 },
    phases,
  );
  check("an undated non-precondition does not jump ahead of the permit",
    withTransport[0]?.serviceKey === "land_permit",
    `first = ${withTransport[0]?.serviceKey}`);
  check("only true preconditions are flagged as such",
    SERVICE_CATALOGUE.filter((s) => s.precondition).every(
      (s) => s.kind === "legal" || s.kind === "procurement"
             || s.key === "feasibility_study"),
    `${SERVICE_CATALOGUE.filter((s) => s.precondition).length} flagged`);
  check("sequence numbers are 1..n with no gaps",
    plan.every((m, i) => m.seq === i + 1), `n=${plan.length}`);
  check("dated work is in calendar order",
    plan
      .filter((m) => m.plannedStart)
      .every((m, i, arr) => i === 0 || arr[i - 1].plannedStart! <= m.plannedStart!));
}

console.log("\nArithmetic");
{
  const plan = buildMilestonePlan(
    [
      { serviceKey: "drone_survey", unitPrice: 3500 },
      { serviceKey: "customs_clearance", unitPrice: 180_000 },
    ],
    { feddans: 100 },
    [],
  );
  const survey = plan.find((m) => m.serviceKey === "drone_survey")!;
  const customs = plan.find((m) => m.serviceKey === "customs_clearance")!;

  check("area service: amount = feddans × price",
    survey.amount === 100 * 3500, `${survey.amount}`);
  check("lump service: amount = price, not price × area",
    customs.amount === 180_000, `${customs.amount}`);
  check("every amount equals quantity × unit price",
    plan.every((m) => Math.abs(m.amount - m.quantity * m.unitPrice) < 1e-9));
}

console.log("\nMachinery: hire, acquire and import stay distinct");
{
  const rental = SERVICE_BY_KEY.machinery_rental;
  const procurement = SERVICE_BY_KEY.machinery_procurement;
  const customs = SERVICE_BY_KEY.customs_clearance;

  check("hiring a machine scales with area", rental.basis === "feddans");
  check("arranging a purchase does not", procurement.basis === "fixed");
  check("clearing an import does not", customs.basis === "fixed");
  check("hire is field work, procurement is administrative",
    rental.phase !== null && procurement.phase === null);
}

console.log("\nUnknown and empty inputs");
{
  check("an unknown service key is skipped, not thrown on",
    buildMilestonePlan(
      [{ serviceKey: "no_such_service" as ServiceKey, unitPrice: 100 }],
      { feddans: 10 },
      [],
    ).length === 0);
  check("no choices yields an empty plan",
    buildMilestonePlan([], { feddans: 10 }, []).length === 0);
  check("no context yields only fixed-basis lines",
    buildMilestonePlan(
      [
        { serviceKey: "drone_survey", unitPrice: 1 },
        { serviceKey: "land_permit", unitPrice: 1 },
      ],
      {},
      [],
    ).length === 1);
}

console.log(
  "\n" + (fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`),
);
process.exit(fail === 0 ? 0 : 1);
