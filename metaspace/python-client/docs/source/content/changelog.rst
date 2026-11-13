Changelog
=========

2.1.0
-----

* Added ROI management: ``SMInstance.get_rois``, ``export_rois``, ``validate_roi_geojson`` and ``import_rois``.
  ROIs are exported to and imported from GeoJSON files.
  See the :doc:`Manage ROIs <examples/manage-rois>` example.
* ``SMInstance.create_database`` accepts an optional ``groupId`` to create a database for a specific group.
* ``SMInstance.logged_in`` no longer raises when the API key is invalid or there is no network connection.
* API requests now send a ``Source: api`` header, used for API usage limits.
* Default host is now ``https://metaspace2020.org``.
