rm -rf .xpi_work_dir/

rm -f ~/Desktop/tapsure.xpi
mkdir .xpi_work_dir
cp -r tapsure/* .xpi_work_dir/
cd .xpi_work_dir/

rm -rf `find . -name ".git"`
rm -rf `find . -name ".DS_Store"`
rm -rf `find . -name "Thumbs.db"`

zip -rq ~/Desktop/tapsure.xpi *
cd ..
rm -rf .xpi_work_dir/

scp ~/Desktop/tapsure.xpi efinke.com:~/webapps/efinke/tapsure.xpi