# Project

All schema changes go through migrations in the migrations folder, and you run them locally before starting the service and review the generated SQL before committing.

Frontend assets are built with the bundler and served from the CDN; never edit files in the output folder by hand because they are regenerated on deploy.
