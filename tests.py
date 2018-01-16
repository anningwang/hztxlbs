#!flask/bin/python
# -*- coding: utf8 -*-
import os
import unittest

from config import basedir
from app import app, db
from app.dijkstra import get_nearest_vertex

from coverage import coverage
cov = coverage(branch=True, omit=['flask/*', 'tests.py'])
cov.start()


class TestCase(unittest.TestCase):
    def setUp(self):
        app.config['TESTING'] = True
        app.config['CSRF_ENABLED'] = False
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'test.db')
        db.create_all()
        
    def tearDown(self):
        db.session.remove()
        # db.drop_all()

    def test_get_nearest_vertex(self):
        vertex = get_nearest_vertex(10775, 8922)        # 办公区，两排办公桌之间
        self.assertEqual(35, vertex)      # 顶点35 在 顶点2 和 3 之间。


if __name__ == '__main__':
    unittest.main()

    cov.stop()
    cov.save()
    print "\n\nCoverage Report:\n"
    cov.report()
    print "\nHTML version: " + os.path.join(basedir, "tmp/coverage/index.html")
    cov.html_report(directory='tmp/coverage')
    cov.erase()
