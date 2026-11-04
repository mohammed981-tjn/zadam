/**
 * الفترة بين ريّة وريّة لا تتغيّر بطريقة الريّ (البند ١٩٨ د١٠).
 *
 * The root zone holds the same water and the crop draws on it at the same rate whether it came by canal, sprinkler or
 * drip. What changes with the method is only how much must be pumped to put that water into the soil. The engine used
 * to divide the plant's draw by the method's efficiency, so the same potato on the same clay waited 2.7 days under
 * flood and 4.5 under drip, while the dose it showed stayed the net one.
 *
 *   npx tsx scripts/verify-irrigation-interval.ts
 */
import { ALL_CROPS, IRRIGATION_EFFICIENCY, M3_PER_MM_PER_FEDDAN, STATIONS, type IrrigationMethod } from "../src/lib/agronomy";
import { irrigationInterval, ROOT_DEPTH_M, TAW_MM_PER_M } from "../src/lib/soilWater";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) {
    console.log(`  FAIL  ${label}`);
    failed++;
  }
};

const methods = Object.keys(IRRIGATION_EFFICIENCY) as IrrigationMethod[];
let cases = 0;
for (const station of STATIONS) {
  for (const crop of ALL_CROPS.filter((c) => ROOT_DEPTH_M[c.key] !== undefined)) {
    for (const soil of Object.keys(TAW_MM_PER_M)) {
      const rs = methods.map((m) => irrigationInterval(crop, station, 10, m, soil));
      if (rs.some((r) => r === null)) continue;
      cases++;
      const first = rs[0]!;
      const tag = `${crop.key}/${station.key}/${soil}`;
      for (let i = 1; i < rs.length; i++) {
        ok(Math.abs(rs[i]!.days - first.days) < 1e-9, `${tag}: ${methods[i]} waits ${rs[i]!.days.toFixed(2)} days, ${methods[0]} ${first.days.toFixed(2)}`);
        ok(Math.abs(rs[i]!.peakMmPerDay - first.peakMmPerDay) < 1e-9, `${tag}: the crop's draw moves with ${methods[i]}`);
      }
      rs.forEach((r, i) => {
        ok(Math.abs(r!.doseM3PerFeddan * IRRIGATION_EFFICIENCY[methods[i]] - r!.doseMm * M3_PER_MM_PER_FEDDAN) < 1e-6, `${tag}: the ${methods[i]} dose is not net plus its losses`);
        ok(Math.abs(r!.peakMmPerDay * r!.days - r!.rawMm) < 1e-9, `${tag}: interval × draw ≠ the root zone's readily available water`);
      });
    }
  }
}

console.log(`  ${cases} حالة (محصول × محطّة × تربة)، بكلّ طرق الريّ`);
const potato = ALL_CROPS.find((c) => c.key === "potato")!;
const khartoum = STATIONS.find((s) => s.key === "khartoum")!;
const flood = irrigationInterval(potato, khartoum, 10, "flood", "clay")!;
const drip = irrigationInterval(potato, khartoum, 10, "drip", "clay")!;
ok(flood.doseM3PerFeddan > drip.doseM3PerFeddan, "flood pumps more than drip for the same refill");
console.log(`  البطاطس في الخرطوم على الطين: كلّ ${flood.days.toFixed(2)} يوم بالغمر والتنقيط معاً؛ يُضخّ ${Math.round(flood.doseM3PerFeddan)} م³ بالغمر و${Math.round(drip.doseM3PerFeddan)} بالتنقيط`);

if (failed > 0) {
  console.error(`\n${failed} فحصاً فشل`);
  process.exit(1);
}
console.log("\nOK");
