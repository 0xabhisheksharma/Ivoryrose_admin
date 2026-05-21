import * as tagsRepo from "@/infrastructure/repositories/tags.repository";

export async function createTag(params: {
  name: string;
  type: string;
  tagId?: string;
}) {
  return tagsRepo.createTag(params);
}
