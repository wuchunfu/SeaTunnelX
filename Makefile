swagger:
	scripts/swagger.sh

tidy:
	scripts/tidy.sh

check_license:
	scripts/license.sh

add_apache_license:
	python3 scripts/add_apache_license.py --git-added --staged

proto:
	scripts/proto.sh

pre_commit: tidy swagger check_license
