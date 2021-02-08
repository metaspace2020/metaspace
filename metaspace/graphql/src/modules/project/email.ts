import sendEmail from '../../utils/sendEmail'
import logger from '../../utils/logger'
import { Project as ProjectModel } from './model'
import config from '../../utils/config'

export const sendPublishProjectNotificationEmail = (email: string, project: ProjectModel) => {
  const subject = `METASPACE project "${project.name}" publishing`
  const text =
      `Dear METASPACE user,

Some time ago you created a review link for the project "${project.name}".
If it has been published, please consider making it public and adding the publication DOI to the project description.
Here is a project link ${config.web_public_url}/project/${project.urlSlug || project.id}

Best wishes,
METASPACE Team`
  sendEmail(email, subject, text)
  logger.info(`Sent project publishing notification email to ${email}`)
}
