import { supabase } from "@/integrations/supabase/client";

export type ScanPage = {
  id: string;
  document_id: string;
  position: number;
  storage_path: string;
  width: number;
  height: number;
  url: string;
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

export async function listDocuments(search = ""): Promise<ScanDocument[]> {
  let query = supabase
    .from("documents")
    .select("id, name, updated_at, document_pages(id, position, storage_path)")
    .order("updated_at", { ascending: false });
  if (search.trim()) query = query.ilike("name", `%${search.trim()}%`);
  const { data, error } = await query;
  if (error) throw error;

  return Promise.all(
    (data ?? []).map(async (doc) => {
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
    .select("id, name, updated_at, document_pages(id, document_id, position, storage_path, width, height)")
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
        url: (await signed(p.storage_path)) ?? "",
      })),
  );

  return { id: data.id, name: data.name, updated_at: data.updated_at, pages };
}

export type NewPage = { blob: Blob; width: number; height: number };

async function uploadPages(userId: string, documentId: string, pages: NewPage[], startAt: number) {
  const rows = [] as {
    document_id: string;
    user_id: string;
    position: number;
    storage_path: string;
    width: number;
    height: number;
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
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("document_pages")
      .update({ position: i })
      .eq("id", orderedIds[i]!);
    if (error) throw error;
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
