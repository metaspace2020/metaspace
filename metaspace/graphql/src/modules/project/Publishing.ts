import { PublicationStatus, UpdateProjectInput } from '../../binding';
import { ProjectSource } from '../../bindingTypes';
import { Context } from '../../context';
import FormValidationErrors from "../../utils/FormValidationErrors";

export const PublicationStatusOptions: Record<PublicationStatus, PublicationStatus> = {
  UNPUBLISHED: 'UNPUBLISHED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  PUBLISHED: 'PUBLISHED',
};

export function validatePublishingRules(ctx: Context, project: ProjectSource, projectDetails: UpdateProjectInput) {
  if (!ctx.isAdmin
    && project.publicationStatus == PublicationStatusOptions.PUBLISHED
    && projectDetails.isPublic == false) {
    throw new FormValidationErrors('isPublic', `Published projects must be visible`);
  }

  if (!ctx.isAdmin
    && projectDetails.urlSlug == null
    && project.urlSlug != null
    && project.publicationStatus == PublicationStatusOptions.UNDER_REVIEW) {
    throw new FormValidationErrors('urlSlug', `Cannot remove project link as the project is under review`);
  }
}
