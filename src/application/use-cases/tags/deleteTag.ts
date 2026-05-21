import * as tagsRepo from "@/infrastructure/repositories/tags.repository";

export async function deleteTag(tagId: string) {
  return tagsRepo.deleteTag(tagId);
}
