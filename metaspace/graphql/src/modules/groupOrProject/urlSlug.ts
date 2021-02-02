import { Brackets, EntityManager, ObjectType } from 'typeorm'
import FormValidationErrors from '../../utils/FormValidationErrors'

interface EntityWithUrlSlug {
  id: string;
  urlSlug: string;
}

export const validateUrlSlugChange = async <EntityType extends ObjectType<EntityWithUrlSlug>>
(entityManager: EntityManager, model: EntityType, existingId: string | null, urlSlug: string) => {
  if (/[^a-zA-Z0-9_-]/.test(urlSlug)) {
    throw new FormValidationErrors('urlSlug',
      'Invalid characters - use alphanumerics separated by minus or underscore')
  }
  if (urlSlug.length < 4 || urlSlug.length > 50) {
    throw new FormValidationErrors('urlSlug', 'Project link must be between 4 and 50 characters')
  }

  const existing = await entityManager.createQueryBuilder(model, 'entity')
    .where(urlSlugMatchesClause('entity', urlSlug))
    .getMany()

  if (existing.some(({ id }) => existingId != null && id !== existingId)) {
    throw new FormValidationErrors('urlSlug', 'This project link has already been used, try something else')
  }
}

export const urlSlugMatchesClause = (relationName: string, urlSlug: string) => {
  return new Brackets(qb =>
    qb.where(`LOWER(REPLACE(${relationName}.urlSlug, '-', '_')) = LOWER(REPLACE(:urlSlug, '-', '_'))`,
      { urlSlug })
  )
}
