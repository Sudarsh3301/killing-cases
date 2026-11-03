import { z } from "zod/v4";
import type { Tool } from "./claude";
import type { RecordIndex } from "./record-index";

export const recordSearchTool = (idx: RecordIndex): Tool => ({
	name: "record_search",
	description: "Full-text search over the record known at filing. Returns up to 6 sections with file, page and text. Pass `file` to search one file.",
	input: z.object({ query: z.string(), file: z.string().optional() }),
	run: async ({ query, file }) => JSON.stringify(idx.search(query, 6, file).map((s) => ({ file: s.file, page: s.page, text: s.text.slice(0, 1500) }))),
});
