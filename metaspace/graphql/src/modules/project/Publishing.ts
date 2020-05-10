import { PublicationStatus, UpdateProjectInput } from '../../binding';
import { ProjectSource } from '../../bindingTypes';
import { Context } from '../../context';
import FormValidationErrors from "../../utils/FormValidationErrors";

export const PublicationStatusOptions: Record<PublicationStatus, PublicationStatus> = {
  UNPUBLISHED: 'UNPUBLISHED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  PUBLISHED: 'PUBLISHED',
};

const PSO = PublicationStatusOptions

export function validatePublishingRules(ctx: Context, project: ProjectSource, projectDetails: UpdateProjectInput) {
  if (ctx.isAdmin) {
    return
  }

  if (project.publicationStatus != PSO.UNPUBLISHED
    && project.urlSlug != null
    && projectDetails.urlSlug == null) {
    throw new FormValidationErrors(
      'urlSlug',
      `Cannot remove short link as the project is ${PSO.UNDER_REVIEW ? 'under review' : 'published'}`
    )
  }

  if (project.publicationStatus == PSO.PUBLISHED
    && projectDetails.isPublic == false) {
    throw new FormValidationErrors('isPublic', `Published projects must be visible`);
  }
}
