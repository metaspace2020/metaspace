-- Multiple steps in this process, but this effectively does this:
-- * Makes `ds_id` non-nullable
-- * Makes `zoom` into a non-nullable float
-- * Inserts a `type` column *before* the `zoom` column (requires some shuffling)
-- * Adds `scale`, `width` and `height` columns
-- * Supplies values for migration via `DEFAULT(1)`, but removes the DEFAULT constraint as all columns are really needed

ALTER TABLE optical_image RENAME COLUMN zoom to _zoom;

ALTER TABLE optical_image
    ALTER COLUMN ds_id SET NOT NULL,
    ADD type text NOT NULL DEFAULT('clipped_to_ion_image'),
    ADD zoom REAL NOT NULL DEFAULT(1),
    ADD width INT NOT NULL DEFAULT(1),
    ADD height INT NOT NULL DEFAULT(1),
    ADD transform REAL[][] DEFAULT(ARRAY[]::REAL[]);

UPDATE public.optical_image SET zoom = _zoom WHERE true;

ALTER TABLE optical_image DROP COLUMN _zoom;

ALTER TABLE optical_image
    ALTER COLUMN type DROP DEFAULT,
    ALTER COLUMN zoom DROP DEFAULT,
    ALTER COLUMN width DROP DEFAULT,
    ALTER COLUMN height DROP DEFAULT,
    ALTER COLUMN transform DROP DEFAULT;