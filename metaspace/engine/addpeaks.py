import psycopg2
import engine.computing

config_db = dict(
                    host="/var/run/postgresql/",
                    db="ims",
                    user="snikolenko",
                    password=""
                )
conn = psycopg2.connect("host='%s' dbname='%s' user='%s' password='%s'" % (
    config_db["host"], config_db["db"], config_db["user"], config_db["password"]
    ))
cur = conn.cursor()
cur.execute("SELECT id,sf FROM formulas")
rows = cur.fetchall()

mzpeaks = {}
mzints = {}
for x in rows:
    d = engine.computing.get_lists_of_mzs(x[1])
	mzpeaks[x[0]] = d["grad_mzs"]
    mzints[x[0]] = d["grad_int"]

with open("mzpeaks.csv", "w") as outfile:
	outfile.write("\n".join(["%s;{%s};{%s}" % (k, ",".join(["%.4f" % x for x in mzpeaks[k]]), ",".join(["%.4f" % x for x in mzints[k]]) ) for k in mzpeaks if len(mzpeaks[k]) > 0 ]))


