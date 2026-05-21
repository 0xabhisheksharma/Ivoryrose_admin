import * as tagsRepo from "@/infrastructure/repositories/tags.repository";

export async function updateTag(
  tagId: string,
  update: { name?: string; type?: string }
) {
  return tagsRepo.updateTag(tagId, update);
}
