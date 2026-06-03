import * as tagsRepo from "@/infrastructure/repositories/tags.repository";

export async function listTags() {
  return tagsRepo.listTags();
}

export async function listTagsPaginated(options?: {
  limit?: number;
  cursor?: string | null;
}) {
  return tagsRepo.listTagsPaginated(options);
}

export async function countTags() {
  return tagsRepo.countTags();
}
