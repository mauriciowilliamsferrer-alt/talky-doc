import { supabase } from "@/integrations/supabase/client";

export type ScanPage = {
  id: string;
  document_id: string;
  position: number;
  storage_path: string;
  width: number;
  height: number;
  url: string;
  ocrText: string | null;
};

export type ScanDocument = {
  id: string;
  name: string;
  updated_at: string;
  pageCount: number;
  thumbnail: string | null;
};

const BUCKET = "scans";

async function requireUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sessão expirada. Entre novamente.");
  return data.user.id;
}

async function signed(path: string, expires = 3600) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, expires);
  return data?.signedUrl ?? null;
}

export async function listDocumentIds(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, name")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listDocuments(search = ""): Promise<ScanDocument[]> {
  const term = search.trim();
  let query = supabase
    .from("documents")
    .select("id, name, updated_at, document_pages(id, position, storage_path)")
    .order("updated_at", { ascending: false });

  if (term) {
    // Search by document name OR by OCR text on any of its pages.
    // The page-level match bubbles up via the join: if any page matches,
    // the document row is included. Supabase PostgREST exposes this as an
    // `or` filter on the related table using the `!inner` hint when needed;
    // here we rely on the separate page query below for the OCR branch.
    query = query.ilike("name", `%${term}%`);
  }

  const { data: nameMatches, error } = await query;
  if (error) throw error;

  // If searching, also find documents whose pages contain the term in ocr_text,
  // then merge the two result sets (deduplicated by id).
  let allDocs = nameMatches ?? [];
  if (term) {
    const { data: pageMatches } = await supabase
      .from("document_pages")
      .select("document_id")
      .ilike("ocr_text", `%${term}%`);

    const ocrDocIds = new Set((pageMatches ?? []).map((p) => p.document_id));
    const nameMatchIds = new Set(allDocs.map((d) => d.id));
    const missingIds = [...ocrDocIds].filter((id) => !nameMatchIds.has(id));

    if (missingIds.length > 0) {
      const { data: extra } = await supabase
        .from("documents")
        .select("id, name, updated_at, document_pages(id, position, storage_path)")
        .in("id", missingIds)
        .order("updated_at", { ascending: false });
      allDocs = [...allDocs, ...(extra ?? [])];
    }
  }

  return Promise.all(
    allDocs.map(async (doc) => {
      const pages = [...(doc.document_pages ?? [])].sort((a, b) => a.position - b.position);
      return {
        id: doc.id,
        name: doc.name,
        updated_at: doc.updated_at,
        pageCount: pages.length,
        thumbnail: pages[0] ? await signed(pages[0].storage_path) : null,
      };
    }),
  );
}

export async function getDocument(id: string) {
  const { data, error } = await supabase
    .from("documents")
    .select("id, name, updated_at, document_pages(id, document_id, position, storage_path, width, height, ocr_text)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const pages: ScanPage[] = await Promise.all(
    [...(data.document_pages ?? [])]
      .sort((a, b) => a.position - b.position)
      .map(async (p) => ({
        id: p.id,
        document_id: p.document_id,
        position: p.position,
        storage_path: p.storage_path,
        width: p.width,
        height: p.height,
        ocrText: (p as { ocr_text?: string | null }).ocr_text ?? null,
        url: (await signed(p.storage_path)) ?? "",
      })),
  );

  return { id: data.id, name: data.name, updated_at: data.updated_at, pages };
}

export type NewPage = { blob: Blob; width: number; height: number; ocrText?: string | null };

async function uploadPages(userId: string, documentId: string, pages: NewPage[], startAt: number) {
  const rows = [] as {
    document_id: string;
    user_id: string;
    position: number;
    storage_path: string;
    width: number;
    height: number;
    ocr_text: string | null;
  }[];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const path = `${userId}/${documentId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, page.blob, { contentType: "image/jpeg", upsert: false });
    if (error) throw error;
    rows.push({
      document_id: documentId,
      user_id: userId,
      position: startAt + i,
      storage_path: path,
      width: page.width,
      height: page.height,
      ocr_text: page.ocrText ?? null,
    });
  }
  if (rows.length) {
    const { error } = await supabase.from("document_pages").insert(rows);
    if (error) throw error;
  }
}

export async function createDocument(name: string, pages: NewPage[]) {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("documents")
    .insert({ name: name.trim() || "Documento", user_id: userId })
    .select("id")
    .single();
  if (error) throw error;
  await uploadPages(userId, data.id, pages, 0);
  return data.id as string;
}

export async function addPages(documentId: string, pages: NewPage[], startAt: number) {
  const userId = await requireUserId();
  await uploadPages(userId, documentId, pages, startAt);
  await touchDocument(documentId);
}

export async function touchDocument(documentId: string) {
  await supabase.from("documents").update({ updated_at: new Date().toISOString() }).eq("id", documentId);
}

export async function renameDocument(documentId: string, name: string) {
  const { error } = await supabase
    .from("documents")
    .update({ name: name.trim() || "Documento" })
    .eq("id", documentId);
  if (error) throw error;
}

export async function deleteDocument(documentId: string) {
  const { data } = await supabase
    .from("document_pages")
    .select("storage_path")
    .eq("document_id", documentId);
  const paths = (data ?? []).map((p) => p.storage_path);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  const { error } = await supabase.from("documents").delete().eq("id", documentId);
  if (error) throw error;
}

export async function deletePage(page: ScanPage) {
  await supabase.storage.from(BUCKET).remove([page.storage_path]);
  const { error } = await supabase.from("document_pages").delete().eq("id", page.id);
  if (error) throw error;
  await touchDocument(page.document_id);
}

export async function reorderPages(documentId: string, orderedIds: string[]) {
  // Sequential updates avoid write races on the same document_pages rows.
  for (let position = 0; position < orderedIds.length; position++) {
    await supabase.from("document_pages").update({ position }).eq("id", orderedIds[position]!);
  }
  await touchDocument(documentId);
}

export async function replacePageImage(page: ScanPage, blob: Blob, width: number, height: number) {
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(page.storage_path, blob, { contentType: "image/jpeg", upsert: true });
  if (upErr) throw upErr;
  const { error } = await supabase
    .from("document_pages")
    .update({ width, height })
    .eq("id", page.id);
  if (error) throw error;
  await touchDocument(page.document_id);
}

export async function updatePageOcrText(pageId: string, ocrText: string) {
  const { error } = await supabase
    .from("document_pages")
    .update({ ocr_text: ocrText } as Record<string, unknown>)
    .eq("id", pageId);
  if (error) throw error;
}
