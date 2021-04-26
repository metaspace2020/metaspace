from typing import Optional, List
from metaspace.sm_annotation_utils import GraphQLClient

try:
    from typing import TypedDict  # Requires Python 3.8
except ImportError:
    TypedDict = dict


class ExternalLink(TypedDict):
    provider: str
    link: str


class ProjectDict(TypedDict):
    id: str
    name: str
    isPublic: bool
    urlSlug: Optional[str]
    currentUserRole: Optional[str]
    numDatasets: int
    publicationStatus: str
    externalLinks: List[ExternalLink]


class ProjectsClient:
    PROJECT_FIELDS = (
        "id name isPublic urlSlug currentUserRole numDatasets publicationStatus"
        " externalLinks { provider link }"
    )

    def __init__(self, gql: GraphQLClient):
        self._gql = gql

    def get_project(self, project_id: str):
        result = self._gql.query(
            """query get_all_projects($projectId: ID!) {
                project(projectId: $projectId) {
                    """
            + self.PROJECT_FIELDS
            + """
                }
            }""",
            {"projectId": project_id},
        )
        return result['project']

    def get_all_projects(self, query: Optional[str] = None):
        result = self._gql.query(
            """query get_all_projects($query: String) {
                allProjects(query: $query, offset: 0, limit: 10000) {
                    """
            + self.PROJECT_FIELDS
            + """
                }
            }""",
            {"query": query},
        )
        return result['allProjects']

    def get_my_projects(self):
        assert self._gql.logged_in, 'Not logged in'
        result = self._gql.query(
            """query get_my_projects {
                currentUser {
                    projects {
                        project {
                            """
            + self.PROJECT_FIELDS
            + """
                        }
                    }
                }
            }"""
        )

        return [p['project'] for p in result.get('currentUser', {}).get('projects', [])]

    def add_project_external_link(
        self, project_id: str, provider: str, link: str, replace_existing=False
    ):
        """
        Note that the current user must have the MANAGER role in the project being edited.

        :param project_id:
        :param provider: Must be a known 3rd party link provider name.
                         Contact us if you're interested in integrating with METASPACE.
        :param link:
        :param replace_existing: pass True to overwrite existing links from the same provider
        :return: The updated list of external links
        """

        result = self._gql.query(
            """mutation($projectId: ID!, $provider: String!, $link: String!, 
                        $replaceExisting: Boolean!) {
                addProjectExternalLink(projectId: $projectId, provider: $provider, link: $link, 
                                       replaceExisting: $replaceExisting) {
                    externalLinks { provider link }
                } 
            }""",
            {
                'projectId': project_id,
                'provider': provider,
                'link': link,
                'replaceExisting': replace_existing,
            },
        )
        return result['addProjectExternalLink']['externalLinks']

    def remove_project_external_link(
        self, project_id: str, provider: str, link: Optional[str] = None
    ):
        """
        Note that the current user must have the MANAGER role in the project being edited.

        :param project_id:
        :param provider:
        :param link: If None, all links from the provider will be removed
        :return: The updated list of external links
        """

        result = self._gql.query(
            """mutation($projectId: ID!, $provider: String!, $link: String!) {
                removeProjectExternalLink(projectId: $projectId, provider: $provider, link: $link) {
                    externalLinks { provider link }
                } 
            }""",
            {'projectId': project_id, 'provider': provider, 'link': link},
        )
        return result['removeProjectExternalLink']['externalLinks']


# Specify __all__ so that Sphinx documents everything in order from most to least interesting
__all__ = [
    'ProjectsClient',
    'ProjectDict',
    'ExternalLink',
]
