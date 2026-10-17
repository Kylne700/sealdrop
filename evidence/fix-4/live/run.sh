#!/bin/sh
# usage: run.sh <name> <script> args...   (L's runner, retargeted to /tmp/fq-F4 and Xvfb :94; scripts take the lock themselves)
export DISPLAY=:94 TORSOCKS_CONF_FILE=/tmp/fq-L/torsocks.conf
n=$1; shift
cd /tmp/fq-F4/repo
timeout -k 5 ${TMO:-900} torsocks nice -n 10 node qa-net/"$@" > /tmp/fq-F4/out/run-$n.log 2>&1
echo "$n exit $?" >> /tmp/fq-F4/out/status.txt
