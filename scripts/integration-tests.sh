PKG_FILE="$PWD/$(npm pack)"
git clone https://github.com/Second-Live/karma-integration-tests.git --depth 1
cd karma-integration-tests
./run.sh $PKG_FILE
