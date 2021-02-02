/* eslint-disable max-len */ // String templates are newline-sensitive, enforcing max-len would make the code messier
import sendEmail from '../../utils/sendEmail'
import config from '../../utils/config'

type User = {
  name: string | null;
  email?: string | null;
  notVerifiedEmail?: string | null;
}

type GroupOrProject = {
  id: string;
  urlSlug?: string | null;
  name: string;
}

export const sentGroupOrProjectInvitationEmail = (type: 'group' | 'project', recipient: User, sender: User, groupOrProject: GroupOrProject) => {
  const subject = `Invitation to join ${type}`
  const text = `Dear ${recipient.name || 'METASPACE user'},

You have been invited to join the "${groupOrProject.name}" ${type} by ${sender.name}. 
You may accept or decline the invitation in your account: ${config.web_public_url}/user/me

Best wishes,
METASPACE Team`
  sendEmail((recipient.email || recipient.notVerifiedEmail)!, subject, text)
}

export const sendRequestAccessEmail = (type: 'group' | 'project', recipient: User, sender: User, groupOrProject: GroupOrProject) => {
  const subject = `Request to join ${type}`
  const text = `Dear ${recipient.name || 'METASPACE user'},

${sender.name || 'A METASPACE user'} has requested to join the "${groupOrProject.name}" ${type}. 
You may accept or decline the request here: ${config.web_public_url}/${type}/${groupOrProject.urlSlug || groupOrProject.id}?tab=members

Best wishes,
METASPACE Team`
  sendEmail((recipient.email || recipient.notVerifiedEmail)!, subject, text)
}

export const sendAcceptanceEmail = (type: 'group' | 'project', recipient: User, groupOrProject: GroupOrProject) => {
  const subject = `Invitation to join ${type}`
  const text = `Dear ${recipient.name || 'METASPACE user'},

Your request to join the "${groupOrProject.name}" ${type} has been accepted. 
You may view the ${type} here: ${config.web_public_url}/${type}/${groupOrProject.urlSlug || groupOrProject.id}

Best wishes,
METASPACE Team`
  sendEmail((recipient.email || recipient.notVerifiedEmail)!, subject, text)
}
