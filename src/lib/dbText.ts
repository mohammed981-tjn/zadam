import { dbMessage } from "./dbMessages";
import { getLocale } from "./locale";

/** A database error's text in the reader's language — for server actions. */
export async function dbText(message: string | null | undefined): Promise<string> {
  return dbMessage(message ?? "", await getLocale());
}
