import psycopg2

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

cur.execute("SELECT peak,spectrum,value FROM job_result_data WHERE job_id=23 AND param=10705")
rows = cur.fetchall()
conn.close()


images = []
for i in xrange(max([row[0] for row in rows])+1):
    images.append({})
for row in rows:
    images[row[0]][row[1]] = row[2]

def corr_dicts(a, b):
    commonkeys = [ k for k in a if k in b ]
    return np.corrcoef(np.array([ a[k] for k in commonkeys ]), np.array([ b[k] for k in commonkeys ]))[0][1]



cur.execute("SELECT id,sf FROM formulas")
rows = cur.fetchall()

mzpeaks = {}
for x in rows:
	mzpeaks[x[0]] = get_lists_of_mzs(x[1])["grad_mzs"]

with open("mzpeaks.csv", "w") as outfile:
	outfile.write("\n".join(["%s;{%s}" % (k, ",".join(["%.4f" % x for x in mzpeaks[k]]) ) for k in mzpeaks if len(mzpeaks[k]) > 0 ]))

cur.execute("INSERT INTO job_result_data VALUES %s" %
				",".join(['(%d, %d, %d, %.6f)' % (self.job_id, -1, k, v) for k,v in res_dict.iteritems()])
			)


