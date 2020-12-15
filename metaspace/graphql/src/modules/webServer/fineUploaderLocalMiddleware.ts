import config from '../../utils/config';
import * as fs from 'fs';
import {promisify} from 'util';
import {Router, Request, Response, NextFunction} from 'express';
import * as mkdirp from 'mkdirp';
import * as multer from 'multer';
import * as bodyParser from 'body-parser';

const readFileAsync = promisify(fs.readFile);
const openAsync = promisify(fs.open);
const closeAsync = promisify(fs.close);
const writeAsync = promisify(fs.write);
const unlinkAsync = promisify(fs.unlink);


function directory(req: Request) {
  return `${config.upload.destination}/${req.body.uuid}`;
}

function filename(req: Request, i?: number) {
  return `${req.body.qqfilename}.${i !== undefined ? i : req.body.qqpartindex}`;
}

async function combineChunks(req: Request, res: Response, next: NextFunction) {
  try {
    const filenames: string[] = [];
    for (let i = 0; i < req.body.qqtotalparts; i++) {
      filenames.push(directory(req) + "/" + filename(req, i));
    }

    const outputFile = await openAsync(directory(req) + "/" + req.body.qqfilename, 'w');
    try {
      for (let fn of filenames) {
        const buf = await readFileAsync(fn);
        await writeAsync(outputFile, buf);
        try {
          await unlinkAsync(fn);
        } catch (ex) {
          console.error(`Failed to delete ${fn}:`, ex);
        }
      }
    } finally {
      await closeAsync(outputFile);
    }
    res.send(200);
  } catch (ex) {
    next(ex);
  }
}

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = directory(req as Request);
    mkdirp(dir, function(err?: Error) {
      if (err)
        cb(err, dir);
      else
        cb(null, dir);
    });
  },
  filename: function (req, file, cb) {
    cb(null, filename(req as Request));
  }
});

const upload = multer({ storage }).single('qqfile');

export default function fineUploaderLocalMiddleware() {
  const router = Router();
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());

  router.post('/', function (req, res) {
    upload(req, res, function (err) {
      // console.log('upload', req.body);
      if (err) {
        console.error(err);
        // TODO specify error
        res.json({success: false});
      } else {
        res.json({success: true});
      }
    })
  });

  router.post('/success', combineChunks);

  return router;
}
