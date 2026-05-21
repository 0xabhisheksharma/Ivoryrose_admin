import * as tagsRepo from "@/infrastructure/repositories/tags.repository";

export async function listTags() {
  return tagsRepo.listTags();
}
