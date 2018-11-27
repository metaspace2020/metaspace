import sendEmail from '../../utils/sendEmail';
import config from '../../utils/config';

type User = {
  name: string | null;
  email?: string | null;
  notVerifiedEmail?: string | null;
}

type Project = {
  id: string;
  urlSlug?: string | null;
  name: string;
}

export const sendProjectInvitationEmail = (recipient: User, sender: User, project: Project) => {
  const subject = 'Invitation to join project';
  const text = `Dear ${recipient.name || 'METASPACE user'},

You have been invited to join the "${project.name}" project by ${sender.name}. You may accept or decline the invitation in your account: ${config.web_public_url}/user/me

Best wishes,
METASPACE Team`;
  sendEmail((recipient.email || recipient.notVerifiedEmail)!, subject, text);
};

export const sendRequestAccessToProjectEmail = (recipient: User, sender: User, project: Project) => {
  const subject = 'Request to join project';
  const text = `Dear ${recipient.name || 'METASPACE user'},

${sender.name || 'A METASPACE user'} has requested to join the "${project.name}" project. You may accept or decline the request here: ${config.web_public_url}/project/${project.urlSlug || project.id}/manage

Best wishes,
METASPACE Team`;
  sendEmail((recipient.email || recipient.notVerifiedEmail)!, subject, text);
};


export const sendProjectAcceptanceEmail = (recipient: User, project: Project) => {
  const subject = 'Invitation to join project';
  const text = `Dear ${recipient.name || 'METASPACE user'},

Your request to join the "${project.name}" project has been accepted. You may view the project here: ${config.web_public_url}/project/${project.urlSlug || project.id}

Best wishes,
METASPACE Team`;
  sendEmail((recipient.email || recipient.notVerifiedEmail)!, subject, text);
};
