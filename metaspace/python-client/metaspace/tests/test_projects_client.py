import pytest

from metaspace.tests.utils import sm


def test_get_all_projects(sm):
    projects = sm.projects.get_all_projects()

    assert len(projects) > 0


def test_get_my_projects(sm):
    projects = sm.projects.get_my_projects()

    assert len(projects) > 0
    assert all(p['currentUserRole'] for p in projects)


def test_get_project(sm):
    project_id = sm.projects.get_all_projects()[0]['id']  #  assuming this works

    project = sm.projects.get_project(project_id)

    assert project['id'] == project_id
    assert project['name']


def test_add_project_external_link(sm):
    # find a project that the current user manages
    my_projects = sm.projects.get_my_projects()
    project_id = [p['id'] for p in my_projects if p['currentUserRole'] == 'MANAGER'][0]
    provider = 'MetaboLights'
    link = 'https://www.ebi.ac.uk/metabolights/MTBLS313'

    result = sm.projects.add_project_external_link(project_id, provider, link)

    assert any(ext_link == {'provider': provider, 'link': link} for ext_link in result)


def test_remove_project_external_link(sm):
    # find a project that the current user manages
    my_projects = sm.projects.get_my_projects()
    project_id = [p['id'] for p in my_projects if p['currentUserRole'] == 'MANAGER'][0]
    provider = 'MetaboLights'
    link = 'https://www.ebi.ac.uk/metabolights/MTBLS313'

    result = sm.projects.remove_project_external_link(project_id, provider, link)

    assert not any(ext_link == {'provider': provider, 'link': link} for ext_link in result)
